import { build as viteBuild } from 'vite'
import { type InlineConfig, type MainViteConfig, type PreloadViteConfig, resolveConfig } from './config'
import { BytecodeBuild, runWithBytecodeBuild } from './bytecode/build'
import { asyncFlatten } from './utils'

async function useBytecode(config?: MainViteConfig | PreloadViteConfig): Promise<boolean> {
  if (!config) return false
  const plugins = await asyncFlatten(config.plugins || [])
  return plugins.some(plugin => plugin && typeof plugin === 'object' && plugin.name === 'vite:bytecode')
}

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = 'production'
  const config = await resolveConfig(inlineConfig, 'build', 'production')

  if (!config.config) {
    return
  }

  const mainBytecode = await useBytecode(config.config.main)
  const preloadBytecode = await useBytecode(config.config.preload)
  const bytecodeBuild = mainBytecode || preloadBytecode ? new BytecodeBuild() : undefined

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

  if (!bytecodeBuild) return buildTargets()

  try {
    await bytecodeBuild.start()
    await runWithBytecodeBuild(bytecodeBuild, buildTargets)
  } finally {
    await bytecodeBuild.stop()
  }
}
