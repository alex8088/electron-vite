import { build as viteBuild, mergeConfig } from 'vite'
import { type InlineConfig, type MainViteConfig, type PreloadViteConfig, resolveConfig } from './config'
import { BytecodeBuild, bytecodeBuildPluginName } from './bytecode/build'
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

  const bytecodeBuild = new BytecodeBuild()
  const config = await resolveConfig(
    mergeConfig(inlineConfig, {
      plugins: [{ name: bytecodeBuildPluginName, api: { build: bytecodeBuild } }]
    }),
    'build',
    'production'
  )

  if (!config.config) {
    return
  }

  const mainBytecode = await useBytecode(config.config.main)
  const preloadBytecode = await useBytecode(config.config.preload)
  const hasBytecode = mainBytecode || preloadBytecode

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
    await bytecodeBuild.start()
    await buildTargets()
  } finally {
    await bytecodeBuild.stop()
  }
}
