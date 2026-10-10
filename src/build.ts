import { build as viteBuild, mergeConfig } from 'vite'
import { type InlineConfig, type MainViteConfig, type PreloadViteConfig, resolveConfig } from './config'
import { BytecodeCompiler } from './bytecodeCompiler'
import { asyncFlatten } from './utils'

async function usesBytecode(config?: MainViteConfig | PreloadViteConfig): Promise<boolean> {
  if (!config) return false
  if (config.build?.bytecode) return true
  const plugins = await asyncFlatten(config.plugins || [])
  return plugins.some(plugin => plugin && typeof plugin === 'object' && plugin.name === 'vite:bytecode')
}

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = 'production'

  const bytecodeCompiler = new BytecodeCompiler()
  const config = await resolveConfig(
    mergeConfig(inlineConfig, {
      plugins: [{ name: 'vite:electron-bytecode-build', api: { compiler: bytecodeCompiler } }]
    }),
    'build',
    'production'
  )

  if (!config.config) {
    return
  }

  const hasBytecode = (await usesBytecode(config.config.main)) || (await usesBytecode(config.config.preload))

  const buildTargets = async (): Promise<void> => {
    // Build targets in order: main -> preload -> renderer
    for (const target of ['main', 'preload', 'renderer'] as const) {
      const viteConfig = config.config?.[target]
      if (viteConfig) {
        // Disable watch mode in production builds
        if (viteConfig.build?.watch) {
          viteConfig.build.watch = null
        }
        await viteBuild(viteConfig)
      }
    }
  }

  if (!hasBytecode) return buildTargets()

  try {
    await bytecodeCompiler.start()
    await buildTargets()
  } finally {
    await bytecodeCompiler.stop()
  }
}
