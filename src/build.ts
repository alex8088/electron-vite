import { build as viteBuild } from 'vite'
import { InlineConfig, resolveConfig } from './config'

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = 'production'
  const config = await resolveConfig(inlineConfig, 'build', 'production')
  if (config.config) {
    const mainViteConfig = config.config?.main
    if (mainViteConfig) {
      if (mainViteConfig.build?.watch) {
        mainViteConfig.build.watch = null
      }
      await viteBuild(mainViteConfig)
    }
    const preloadViteConfig = config.config?.preload
    if (preloadViteConfig) {
      if (preloadViteConfig.build?.watch) {
        preloadViteConfig.build.watch = null
      }
      await viteBuild(preloadViteConfig)
    }
    const rendererViteConfig = config.config?.renderer
    if (rendererViteConfig) {
      if (rendererViteConfig.build?.watch) {
        rendererViteConfig.build.watch = null
      }
      await viteBuild(rendererViteConfig)
    }
  }
}
