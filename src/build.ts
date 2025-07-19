import { build as viteBuild } from 'vite'
import { type InlineConfig, resolveConfig, type InlineUserConfig } from './config'

/**
 * Bundles the electron app for production.
 */
export async function build(inlineConfig: InlineConfig = {}): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = 'production'
  const config = await resolveConfig(inlineConfig, 'build', 'production')
  if (config.config) {
    const mainViteConfig = config.config?.main
    if (mainViteConfig) {
      await _build(mainViteConfig)
    }
    const preloadViteConfig = config.config?.preload
    if (preloadViteConfig) {
      if (Array.isArray(preloadViteConfig)) {
        await Promise.all(preloadViteConfig.map(_build))
      } else {
        await _build(preloadViteConfig)
      }
    }
    const rendererViteConfig = config.config?.renderer
    if (rendererViteConfig) {
      _build(rendererViteConfig)
    }
  }
}

async function _build(config: InlineUserConfig): Promise<void> {
  if (config.build?.watch) {
    config.build.watch = null
  }
  await viteBuild(config)
}
