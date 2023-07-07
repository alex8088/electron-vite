import path from 'node:path'
import fs from 'node:fs'
import { builtinModules } from 'node:module'
import colors from 'picocolors'
import { type Plugin, mergeConfig, normalizePath } from 'vite'
import { getElectronNodeTarget, getElectronChromeTarget } from '../electron'

export interface ElectronPluginOptions {
  root?: string
}

function findLibEntry(root: string, scope: string): string {
  for (const name of ['index', scope]) {
    for (const ext of ['js', 'ts', 'mjs', 'cjs']) {
      const entryFile = path.resolve(root, 'src', scope, `${name}.${ext}`)
      if (fs.existsSync(entryFile)) {
        return entryFile
      }
    }
  }
  return ''
}

function findInput(root: string, scope = 'renderer'): string {
  const rendererDir = path.resolve(root, 'src', scope, 'index.html')
  if (fs.existsSync(rendererDir)) {
    return rendererDir
  }
  return ''
}

function processEnvDefine(): Record<string, string> {
  return {
    'process.env': `process.env`,
    'global.process.env': `global.process.env`,
    'globalThis.process.env': `globalThis.process.env`
  }
}

export function electronMainVitePlugin(options?: ElectronPluginOptions): Plugin[] {
  return [
    {
      name: 'vite:electron-main-preset-config',
      apply: 'build',
      enforce: 'pre',
      config(config): void {
        const root = options?.root || process.cwd()

        const nodeTarget = getElectronNodeTarget()

        const defaultConfig = {
          resolve: {
            browserField: false,
            mainFields: ['module', 'jsnext:main', 'jsnext'],
            conditions: ['node']
          },
          build: {
            outDir: path.resolve(root, 'out', 'main'),
            target: nodeTarget,
            assetsDir: 'chunks',
            rollupOptions: {
              external: ['electron', ...builtinModules.flatMap(m => [m, `node:${m}`])],
              output: {
                entryFileNames: '[name].js'
              }
            },
            reportCompressedSize: false,
            minify: false
          }
        }

        const build = config.build || {}
        const rollupOptions = build.rollupOptions || {}
        if (!rollupOptions.input) {
          defaultConfig.build['lib'] = {
            entry: findLibEntry(root, 'main'),
            formats: ['cjs']
          }
        } else {
          defaultConfig.build.rollupOptions.output['format'] = 'cjs'
        }

        defaultConfig.build.rollupOptions.output['assetFileNames'] = path.posix.join(
          build.assetsDir || defaultConfig.build.assetsDir,
          '[name]-[hash].[ext]'
        )

        const buildConfig = mergeConfig(defaultConfig.build, build)
        config.build = buildConfig

        config.resolve = mergeConfig(defaultConfig.resolve, config.resolve || {})

        config.define = config.define || {}
        config.define = { ...processEnvDefine(), ...config.define }

        config.envPrefix = config.envPrefix || 'MAIN_VITE_'

        config.publicDir = config.publicDir || 'resources'
        // do not copy public dir
        config.build.copyPublicDir = false
        // module preload polyfill does not apply to nodejs (main process)
        config.build.modulePreload = false
      }
    },
    {
      name: 'vite:electron-main-resolved-config',
      apply: 'build',
      enforce: 'post',
      configResolved(config): void {
        const build = config.build
        if (!build.target) {
          throw new Error('build target required for the electron vite main config')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('node'))) {
            throw new Error('the electron vite main config build target must be node')
          }
        }

        const lib = build.lib
        if (!lib) {
          const rollupOptions = build.rollupOptions
          if (!rollupOptions?.input) {
            throw new Error('build lib field required for the electron vite main config')
          } else {
            const output = rollupOptions?.output
            if (output) {
              const formats = Array.isArray(output) ? output : [output]
              if (formats.some(f => f.format !== 'cjs')) {
                throw new Error('the electron vite main config output format must be cjs')
              }
            }
          }
        } else {
          if (!lib.entry) {
            throw new Error('build entry field required for the electron vite main config')
          }
          if (!lib.formats) {
            throw new Error('build format field required for the electron vite main config')
          } else if (!lib.formats.includes('cjs')) {
            throw new Error('the electron vite main config build lib format must be cjs')
          }
        }
      }
    }
  ]
}

export function electronPreloadVitePlugin(options?: ElectronPluginOptions): Plugin[] {
  return [
    {
      name: 'vite:electron-preload-preset-config',
      apply: 'build',
      enforce: 'pre',
      config(config): void {
        const root = options?.root || process.cwd()

        const nodeTarget = getElectronNodeTarget()

        const defaultConfig = {
          build: {
            outDir: path.resolve(root, 'out', 'preload'),
            target: nodeTarget,
            assetsDir: 'chunks',
            rollupOptions: {
              external: ['electron', ...builtinModules.flatMap(m => [m, `node:${m}`])],
              output: {
                entryFileNames: '[name].js'
              }
            },
            reportCompressedSize: false,
            minify: false
          }
        }

        const build = config.build || {}
        const rollupOptions = build.rollupOptions || {}
        if (!rollupOptions.input) {
          defaultConfig.build['lib'] = {
            entry: findLibEntry(root, 'preload'),
            formats: ['cjs']
          }
        } else {
          defaultConfig.build.rollupOptions.output['format'] = 'cjs'
        }

        defaultConfig.build.rollupOptions.output['assetFileNames'] = path.posix.join(
          build.assetsDir || defaultConfig.build.assetsDir,
          '[name]-[hash].[ext]'
        )

        const buildConfig = mergeConfig(defaultConfig.build, build)
        config.build = buildConfig

        config.define = config.define || {}
        config.define = { ...processEnvDefine(), ...config.define }

        config.envPrefix = config.envPrefix || 'PRELOAD_VITE_'

        config.publicDir = config.publicDir || 'resources'
        // do not copy public dir
        config.build.copyPublicDir = false
        // module preload polyfill does not apply to nodejs (preload scripts)
        config.build.modulePreload = false
      }
    },
    {
      name: 'vite:electron-preload-resolved-config',
      apply: 'build',
      enforce: 'post',
      configResolved(config): void {
        const build = config.build
        if (!build.target) {
          throw new Error('build target required for the electron vite preload config')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('node'))) {
            throw new Error('the electron vite preload config build target must be node')
          }
        }

        const lib = build.lib
        if (!lib) {
          const rollupOptions = build.rollupOptions
          if (!rollupOptions?.input) {
            throw new Error('build lib field required for the electron vite preload config')
          } else {
            const output = rollupOptions?.output
            if (output) {
              const formats = Array.isArray(output) ? output : [output]
              if (formats.some(f => f.format !== 'cjs')) {
                throw new Error('the electron vite preload config output format must be cjs')
              }
            }
          }
        } else {
          if (!lib.entry) {
            throw new Error('build entry field required for the electron vite preload config')
          }
          if (!lib.formats) {
            throw new Error('build format field required for the electron vite preload config')
          } else if (!lib.formats.includes('cjs')) {
            throw new Error('the electron vite preload config lib format must be cjs')
          }
        }
      }
    }
  ]
}

export function electronRendererVitePlugin(options?: ElectronPluginOptions): Plugin[] {
  return [
    {
      name: 'vite:electron-renderer-preset-config',
      enforce: 'pre',
      config(config): void {
        const root = options?.root || process.cwd()

        config.base =
          config.mode === 'production' || process.env.NODE_ENV_ELECTRON_VITE === 'production' ? './' : config.base
        config.root = config.root || './src/renderer'

        const chromeTarget = getElectronChromeTarget()

        const emptyOutDir = (): boolean => {
          let outDir = config.build?.outDir
          if (outDir) {
            if (!path.isAbsolute(outDir)) {
              outDir = path.resolve(root, outDir)
            }
            const resolvedRoot = normalizePath(path.resolve(root))
            return normalizePath(outDir).startsWith(resolvedRoot + '/')
          }
          return true
        }

        const defaultConfig = {
          build: {
            outDir: path.resolve(root, 'out', 'renderer'),
            target: chromeTarget,
            modulePreload: { polyfill: false },
            rollupOptions: {
              input: findInput(root)
            },
            reportCompressedSize: false,
            minify: false,
            emptyOutDir: emptyOutDir()
          }
        }

        if (config.build?.outDir) {
          config.build.outDir = path.resolve(root, config.build.outDir)
        }

        const buildConfig = mergeConfig(defaultConfig.build, config.build || {})
        config.build = buildConfig

        config.envDir = config.envDir || path.resolve(root)

        config.envPrefix = config.envPrefix || 'RENDERER_VITE_'
      }
    },
    {
      name: 'vite:electron-renderer-resolved-config',
      enforce: 'post',
      configResolved(config): void {
        if (config.base !== './' && config.base !== '/') {
          config.logger.warn(colors.yellow('should not set base field for the electron vite renderer config'))
        }

        const build = config.build
        if (!build.target) {
          throw new Error('build target required for the electron vite renderer config')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('chrome') && !/^es((202\d{1})|next)$/.test(t))) {
            throw new Error('the electron vite renderer config build target must be chrome? or es?')
          }
        }

        const rollupOptions = build.rollupOptions
        if (!rollupOptions.input) {
          config.logger.warn(colors.yellow(`index.html file is not found in ${colors.dim('/src/renderer')} directory`))
          throw new Error('build rollupOptions input field required for the electron vite renderer config')
        }
      }
    }
  ]
}
