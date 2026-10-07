import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { getElectronPath } from '../electron'

const require = createRequire(import.meta.url)
const RPC_TIMEOUT = 30_000
const SHUTDOWN_TIMEOUT = 3_000

export type BytecodeCompileResult = {
  sourceLength: number
  /** Base64-encoded V8 cachedData; decode with Buffer.from(cachedData, 'base64'). */
  cachedData: string
}

export type BytecodeTarget = 'main' | 'preload'

type CompilerResponse = {
  type: 'response'
  invocationId: number
  result?: unknown
  error?: { name: string; message: string; stack?: string }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class BytecodeCompiler {
  private ps?: ChildProcess
  private rpcMap = new Map<number, PendingRequest>()
  private invocationId = 0
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private ready = false
  private stderr = ''

  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error('BytecodeCompiler is stopping'))
    if (this.starting) return this.starting
    if (this.ready) return Promise.resolve()
    if (this.ps) return Promise.reject(new Error('Previous Electron process has not closed; await stop() first'))
    this.starting = this.initialize().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async initialize(): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_VITE_RPC: 'true' }
    delete env.ELECTRON_RUN_AS_NODE
    this.stderr = ''
    const compilerPath = path.join(
      path.dirname(require.resolve('electron-vite/package.json')),
      'bin',
      'electron-bytecode-main.cjs'
    )
    const ps = spawn(getElectronPath(), [compilerPath], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
      env
    })
    this.ps = ps
    if (ps.stderr) {
      ps.stderr.setEncoding('utf8')
      ps.stderr.on('data', (chunk: string) => {
        if (this.ps === ps) this.stderr = (this.stderr + chunk).slice(-64 * 1024)
      })
    }
    ps.on('message', (message: CompilerResponse) => {
      if (this.ps !== ps || !message || message.type !== 'response') return
      const pending = this.rpcMap.get(message.invocationId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.rpcMap.delete(message.invocationId)
      if (message.error) {
        const error = new Error(message.error.message)
        error.name = message.error.name
        if (message.error.stack) error.stack = message.error.stack
        pending.reject(error)
      } else pending.resolve(message.result)
    })
    ps.on('error', error => {
      if (this.ps === ps) this.rejectPending(error)
    })
    ps.on('disconnect', () => {
      if (this.ps === ps) this.rejectPending(new Error('Electron IPC disconnected'))
    })
    ps.on('exit', (code, signal) => {
      if (this.ps === ps) this.rejectPending(new Error('Electron exited (code ' + code + ', signal ' + signal + ')'))
    })
    ps.on('close', () => {
      if (this.ps === ps) {
        this.rejectPending(new Error('Electron process closed'))
        this.ps = undefined
      }
    })
    try {
      await this.sendRequest('ready', [])
      if (!ps.connected || this.stopping) throw new Error('Electron stopped during initialization')
      this.ready = true
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  compile(target: BytecodeTarget, code: string): Promise<BytecodeCompileResult> {
    return this.request<BytecodeCompileResult>('compile', target, code)
  }

  async request<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
    if (!this.ready || this.stopping) throw new Error('BytecodeCompiler is not ready; await start() first')
    return this.sendRequest(cmd, args) as Promise<T>
  }

  private sendRequest(cmd: string, args: unknown[]): Promise<unknown> {
    const ps = this.ps
    if (!ps?.connected) return Promise.reject(new Error('Electron IPC is not connected'))
    const invocationId = this.invocationId++
    return new Promise((resolve, reject) => {
      const fail = (error: Error): void => {
        const pending = this.rpcMap.get(invocationId)
        if (!pending) return
        clearTimeout(pending.timer)
        this.rpcMap.delete(invocationId)
        reject(this.withStderr(error))
      }
      const timer = setTimeout(() => fail(new Error('Electron RPC timed out: ' + cmd)), RPC_TIMEOUT)
      this.rpcMap.set(invocationId, { resolve, reject, timer })
      try {
        ps.send({ type: 'request', invocationId, cmd, args }, error => {
          if (error) fail(error)
        })
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private rejectPending(error: Error): void {
    this.ready = false
    if (this.rpcMap.size) this.withStderr(error)
    for (const pending of this.rpcMap.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.rpcMap.clear()
  }

  private withStderr(error: Error): Error {
    const stderr = this.stderr.trim()
    if (stderr) {
      const stack = error.stack
      error.message += '\n' + stderr
      if (stack) error.stack = stack + '\n' + stderr
    }
    return error
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    this.rejectPending(new Error('BytecodeCompiler stopped'))
    const ps = this.ps
    if (!ps) return Promise.resolve()
    this.stopping = new Promise<void>(resolve => {
      const timer = setTimeout(() => ps.kill('SIGKILL'), SHUTDOWN_TIMEOUT)
      ps.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      if (ps.connected) {
        try {
          ps.send({ type: 'shutdown' }, error => {
            if (error) ps.kill()
          })
        } catch {
          ps.kill()
        }
      } else ps.kill()
    }).finally(() => {
      this.stopping = undefined
    })
    return this.stopping
  }
}
