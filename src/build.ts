import { build as viteBuild } from 'vite'
import { type InlineConfig, resolveConfig } from './config'

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = 'production'
  const config = await resolveConfig(inlineConfig, 'build', 'production')

  if (!config.config) {
    return
  }

  // Build targets in order: main -> preload -> renderer
  const buildTargets = ['main', 'preload', 'renderer'] as const

  for (const target of buildTargets) {
    const viteConfig = config.config[target]
    if (viteConfig) {
      // Disable watch mode in production builds
      if (viteConfig.build?.watch) {
        viteConfig.build.watch = null
      }
      await viteBuild(viteConfig)
    }
  }
}
