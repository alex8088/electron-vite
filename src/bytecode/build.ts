import { AsyncLocalStorage } from 'node:async_hooks'
import { BytecodeCompiler, type BytecodeCompileResult, type BytecodeTarget } from './compiler'

// Nested isolated-entry builds inherit the compilation session from the parent build.
const activeBuild = new AsyncLocalStorage<BytecodeBuild>()

export class BytecodeBuild {
  private readonly compiler = new BytecodeCompiler()

  start(): Promise<void> {
    return this.compiler.start()
  }

  compile(target: BytecodeTarget, code: string): Promise<BytecodeCompileResult> {
    return this.compiler.compile(target, code)
  }

  stop(): Promise<void> {
    return this.compiler.stop()
  }
}

export function runWithBytecodeBuild<T>(build: BytecodeBuild, callback: () => Promise<T>): Promise<T> {
  return activeBuild.run(build, callback)
}

export function getBytecodeBuild(): BytecodeBuild | undefined {
  return activeBuild.getStore()
}
