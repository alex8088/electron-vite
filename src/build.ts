import { build as viteBuild } from 'vite'
import { InlineConfig, resolveConfig } from './config'

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  const config = await resolveConfig(inlineConfig, 'build', 'production')
  if (config.config) {
    const mainViteConfig = config.config?.main
    if (mainViteConfig) {
      await viteBuild(mainViteConfig)
    }
    const preloadViteConfig = config.config?.preload
    if (preloadViteConfig) {
      await viteBuild(preloadViteConfig)
    }
    const rendererViteConfig = config.config?.renderer
    if (rendererViteConfig) {
      await viteBuild(rendererViteConfig)
    }
  }
}
