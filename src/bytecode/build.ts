import { type Plugin } from 'vite'
import { BytecodeCompiler, type BytecodeCompileResult, type BytecodeTarget } from './compiler'

export const bytecodeBuildPluginName = 'vite:electron-bytecode-build'

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

export function getBytecodeBuild(plugins: readonly Plugin[]): BytecodeBuild | undefined {
  const plugin = plugins.find(plugin => plugin.name === bytecodeBuildPluginName)
  return (plugin?.api as { build?: BytecodeBuild } | undefined)?.build
}
