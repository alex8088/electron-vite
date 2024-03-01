import path from 'node:path'
import fs from 'node:fs'
import { builtinModules } from 'node:module'
import colors from 'picocolors'
import { type Plugin, type LibraryOptions, mergeConfig, normalizePath } from 'vite'
import type { OutputOptions } from 'rollup'
import { getElectronNodeTarget, getElectronChromeTarget, supportESM } from '../electron'
import { loadPackageData } from '../utils'

export interface ElectronPluginOptions {
  root?: string
}

function findLibEntry(root: string, scope: string): string | undefined {
  for (const name of ['index', scope]) {
    for (const ext of ['js', 'ts', 'mjs', 'cjs']) {
      const entryFile = path.resolve(root, 'src', scope, `${name}.${ext}`)
      if (fs.existsSync(entryFile)) {
        return entryFile
      }
    }
  }
  return undefined
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

function resolveBuildOutputs(
  outputs: OutputOptions | OutputOptions[] | undefined,
  libOptions: LibraryOptions | false
): OutputOptions | OutputOptions[] | undefined {
  if (libOptions && !Array.isArray(outputs)) {
    const libFormats = libOptions.formats || []
    return libFormats.map(format => ({ ...outputs, format }))
  }
  return outputs
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

        const pkg = loadPackageData() || { type: 'commonjs' }

        const format = pkg.type && pkg.type === 'module' && supportESM() ? 'es' : 'cjs'

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
              external: ['electron', /^electron\/.+/, ...builtinModules.flatMap(m => [m, `node:${m}`])],
              output: {}
            },
            reportCompressedSize: false,
            minify: false
          }
        }

        const build = config.build || {}
        const rollupOptions = build.rollupOptions || {}
        if (!rollupOptions.input) {
          const libOptions = build.lib
          const outputOptions = rollupOptions.output
          defaultConfig.build['lib'] = {
            entry: findLibEntry(root, 'main'),
            formats:
              libOptions && libOptions.formats && libOptions.formats.length > 0
                ? []
                : [
                    outputOptions && !Array.isArray(outputOptions) && outputOptions.format
                      ? outputOptions.format
                      : format
                  ]
          }
        } else {
          defaultConfig.build.rollupOptions.output['format'] = format
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

        config.envPrefix = config.envPrefix || ['MAIN_VITE_', 'VITE_']

        config.publicDir = config.publicDir || 'resources'
        // do not copy public dir
        config.build.copyPublicDir = false
        // module preload polyfill does not apply to nodejs (main process)
        config.build.modulePreload = false
        // enable ssr build
        config.build.ssr = true
        config.build.ssrEmitAssets = true
        config.ssr = { ...config.ssr, ...{ noExternal: true } }
      }
    },
    {
      name: 'vite:electron-main-resolved-config',
      apply: 'build',
      enforce: 'post',
      configResolved(config): void {
        const build = config.build
        if (!build.target) {
          throw new Error('build.target option is required in the electron vite main config.')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('node'))) {
            throw new Error('The electron vite main config build.target option must be "node?".')
          }
        }

        const libOptions = build.lib
        const rollupOptions = build.rollupOptions

        if (!(libOptions && libOptions.entry) && !rollupOptions?.input) {
          throw new Error(
            'An entry point is required in the electron vite main config, ' +
              'which can be specified using "build.lib.entry" or "build.rollupOptions.input".'
          )
        }

        const resolvedOutputs = resolveBuildOutputs(rollupOptions.output, libOptions)

        if (resolvedOutputs) {
          const outputs = Array.isArray(resolvedOutputs) ? resolvedOutputs : [resolvedOutputs]
          if (outputs.length > 1) {
            throw new Error('The electron vite main config does not support multiple outputs.')
          } else {
            const outpout = outputs[0]
            if (['es', 'cjs'].includes(outpout.format || '')) {
              if (outpout.format === 'es' && !supportESM()) {
                throw new Error(
                  'The electron vite main config output format does not support "es", ' +
                    'you can upgrade electron to the latest version or switch to "cjs" format.'
                )
              }
            } else {
              throw new Error(
                `The electron vite main config output format must be "cjs"${supportESM() ? ' or "es"' : ''}.`
              )
            }
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

        const pkg = loadPackageData() || { type: 'commonjs' }

        const format = pkg.type && pkg.type === 'module' && supportESM() ? 'es' : 'cjs'

        const defaultConfig = {
          build: {
            outDir: path.resolve(root, 'out', 'preload'),
            target: nodeTarget,
            assetsDir: 'chunks',
            rollupOptions: {
              external: ['electron', /^electron\/.+/, ...builtinModules.flatMap(m => [m, `node:${m}`])],
              output: {}
            },
            reportCompressedSize: false,
            minify: false
          }
        }

        const build = config.build || {}
        const rollupOptions = build.rollupOptions || {}
        if (!rollupOptions.input) {
          const libOptions = build.lib
          const outputOptions = rollupOptions.output
          defaultConfig.build['lib'] = {
            entry: findLibEntry(root, 'preload'),
            formats:
              libOptions && libOptions.formats && libOptions.formats.length > 0
                ? []
                : [
                    outputOptions && !Array.isArray(outputOptions) && outputOptions.format
                      ? outputOptions.format
                      : format
                  ]
          }
        } else {
          defaultConfig.build.rollupOptions.output['format'] = format
        }

        defaultConfig.build.rollupOptions.output['assetFileNames'] = path.posix.join(
          build.assetsDir || defaultConfig.build.assetsDir,
          '[name]-[hash].[ext]'
        )

        const buildConfig = mergeConfig(defaultConfig.build, build)
        config.build = buildConfig

        const resolvedOutputs = resolveBuildOutputs(config.build.rollupOptions!.output, config.build.lib || false)

        if (resolvedOutputs) {
          const outputs = Array.isArray(resolvedOutputs) ? resolvedOutputs : [resolvedOutputs]

          if (outputs.find(({ format }) => format === 'es')) {
            if (Array.isArray(config.build.rollupOptions!.output)) {
              config.build.rollupOptions!.output.forEach(output => {
                if (output.format === 'es') {
                  output['entryFileNames'] = '[name].mjs'
                  output['chunkFileNames'] = '[name]-[hash].mjs'
                }
              })
            } else {
              config.build.rollupOptions!.output!['entryFileNames'] = '[name].mjs'
              config.build.rollupOptions!.output!['chunkFileNames'] = '[name]-[hash].mjs'
            }
          }
        }

        config.define = config.define || {}
        config.define = { ...processEnvDefine(), ...config.define }

        config.envPrefix = config.envPrefix || ['PRELOAD_VITE_', 'VITE_']

        config.publicDir = config.publicDir || 'resources'
        // do not copy public dir
        config.build.copyPublicDir = false
        // module preload polyfill does not apply to nodejs (preload scripts)
        config.build.modulePreload = false
        // enable ssr build
        config.build.ssr = true
        config.build.ssrEmitAssets = true
        config.ssr = { ...config.ssr, ...{ noExternal: true } }
      }
    },
    {
      name: 'vite:electron-preload-resolved-config',
      apply: 'build',
      enforce: 'post',
      configResolved(config): void {
        const build = config.build
        if (!build.target) {
          throw new Error('build.target option is required in the electron vite preload config.')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('node'))) {
            throw new Error('The electron vite preload config build.target must be "node?".')
          }
        }

        const libOptions = build.lib
        const rollupOptions = build.rollupOptions

        if (!(libOptions && libOptions.entry) && !rollupOptions?.input) {
          throw new Error(
            'An entry point is required in the electron vite preload config, ' +
              'which can be specified using "build.lib.entry" or "build.rollupOptions.input".'
          )
        }

        const resolvedOutputs = resolveBuildOutputs(rollupOptions.output, libOptions)

        if (resolvedOutputs) {
          const outputs = Array.isArray(resolvedOutputs) ? resolvedOutputs : [resolvedOutputs]
          if (outputs.length > 1) {
            throw new Error('The electron vite preload config does not support multiple outputs.')
          } else {
            const outpout = outputs[0]
            if (['es', 'cjs'].includes(outpout.format || '')) {
              if (outpout.format === 'es' && !supportESM()) {
                throw new Error(
                  'The electron vite preload config output format does not support "es", ' +
                    'you can upgrade electron to the latest version or switch to "cjs" format.'
                )
              }
            } else {
              throw new Error(
                `The electron vite preload config output format must be "cjs"${supportESM() ? ' or "es"' : ''}.`
              )
            }
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

        config.envPrefix = config.envPrefix || ['RENDERER_VITE_', 'VITE_']
      }
    },
    {
      name: 'vite:electron-renderer-resolved-config',
      enforce: 'post',
      configResolved(config): void {
        if (config.base !== './' && config.base !== '/') {
          config.logger.warn(colors.yellow('(!) Should not set "base" option for the electron vite renderer config.'))
        }

        const build = config.build
        if (!build.target) {
          throw new Error('build.target option is required in the electron vite renderer config.')
        } else {
          const targets = Array.isArray(build.target) ? build.target : [build.target]
          if (targets.some(t => !t.startsWith('chrome') && !/^es((202\d{1})|next)$/.test(t))) {
            config.logger.warn(
              'The electron vite renderer config build.target is not "chrome?" or "es?". This could be a mistake.'
            )
          }
        }

        const rollupOptions = build.rollupOptions
        if (!rollupOptions.input) {
          config.logger.warn(colors.yellow(`index.html file is not found in ${colors.dim('/src/renderer')} directory.`))
          throw new Error('build.rollupOptions.input option is required in the electron vite renderer config.')
        }
      }
    }
  ]
}
