import { type Plugin, mergeConfig } from 'vite'
import { loadPackageData } from '../utils'

export interface ExternalOptions {
  exclude?: string[]
  include?: string[]
}

/**
 * Automatically externalize dependencies
 */
export function externalizeDepsPlugin(options: ExternalOptions = {}): Plugin | null {
  const { exclude = [], include = [] } = options

  const pkg = loadPackageData() || {}
  let deps = Object.keys(pkg.dependencies || {})

  if (include.length) {
    deps = deps.concat(include.filter(dep => dep.trim() !== ''))
  }

  if (exclude.length) {
    deps = deps.filter(dep => !exclude.includes(dep))
  }

  deps = [...new Set(deps)]

  return {
    name: 'vite:externalize-deps',
    enforce: 'pre',
    config(config): void {
      const defaultConfig = {
        build: {
          rollupOptions: {
            external: deps.length > 0 ? [...deps, new RegExp(`^(${deps.join('|')})/.+`)] : []
          }
        }
      }
      const buildConfig = mergeConfig(defaultConfig.build, config.build || {})
      config.build = buildConfig
    }
  }
}
