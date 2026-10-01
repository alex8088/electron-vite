import { type ChildProcess, spawn } from 'node:child_process'

export type ElectronCompilerOptions = {
  path: string
  args: string[]
  env?: NodeJS.ProcessEnv
  timeout?: number
  shutdownTimeout?: number
}

export type BytecodeCompileResult = {
  sourceLength: number
  /** Base64-encoded V8 cachedData; decode with Buffer.from(cachedData, 'base64'). */
  cachedData: string
}

type ElectronResponse = {
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

export class ElectronCompiler {
  private ps?: ChildProcess
  private rpcMap = new Map<number, PendingRequest>()
  private invocationId = 0
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private ready = false
  private stderr = ''

  constructor(readonly options: ElectronCompilerOptions) {
    for (const timeout of [options.timeout, options.shutdownTimeout]) {
      if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
        throw new RangeError('ElectronCompiler timeouts must be positive finite numbers')
      }
    }
  }

  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error('ElectronCompiler is stopping'))
    if (this.starting) return this.starting
    if (this.ready) return Promise.resolve()
    if (this.ps) return Promise.reject(new Error('Previous Electron process has not closed; await stop() first'))
    this.starting = this.initialize().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async initialize(): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.options.env, ELECTRON_VITE_RPC: 'true' }
    delete env.ELECTRON_RUN_AS_NODE
    this.stderr = ''
    const ps = spawn(this.options.path, this.options.args, {
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
    ps.on('message', (message: ElectronResponse) => {
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

  compile(code: string): Promise<BytecodeCompileResult> {
    return this.request<BytecodeCompileResult>('compile', code)
  }

  async request<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
    if (!this.ready || this.stopping) throw new Error('ElectronCompiler is not ready; await start() first')
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
      const timer = setTimeout(() => fail(new Error('Electron RPC timed out: ' + cmd)), this.options.timeout ?? 30000)
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
    this.rejectPending(new Error('ElectronCompiler stopped'))
    const ps = this.ps
    if (!ps) return Promise.resolve()
    this.stopping = new Promise<void>(resolve => {
      const timer = setTimeout(() => ps.kill('SIGKILL'), this.options.shutdownTimeout ?? 3000)
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
