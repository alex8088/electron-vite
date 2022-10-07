import path from 'node:path'
import fs from 'node:fs'
import colors from 'picocolors'
import { builtinModules, createRequire } from 'node:module'
import { type Plugin, type ResolvedConfig, mergeConfig, normalizePath } from 'vite'
import { compileToBytecode, bytecodeModuleLoaderCode } from './bytecode'
import * as babel from '@babel/core'

export interface ElectronPluginOptions {
  root?: string
}

export interface BytecodeOptions {
  chunkAlias?: string | string[]
  transformArrowFunctions?: boolean
  removeBundleJS?: boolean
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

        const electornVer = getElectronMainVer(root)
        const nodeTarget = getElectronNodeTarget(electornVer)

        const defaultConfig = {
          build: {
            outDir: path.resolve(root, 'out', 'main'),
            target: nodeTarget,
            lib: {
              entry: findLibEntry(root, 'main'),
              formats: ['cjs']
            },
            rollupOptions: {
              external: ['electron', 'sqlite3', ...builtinModules.flatMap(m => [m, `node:${m}`])],
              output: {
                entryFileNames: '[name].js'
              }
            },
            reportCompressedSize: false,
            minify: false
          }
        }

        const buildConfig = mergeConfig(defaultConfig.build, config.build || {})
        config.build = buildConfig

        config.define = config.define || {}
        config.define = { ...processEnvDefine(), ...config.define }

        config.envPrefix = config.envPrefix || 'MAIN_VITE_'
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
          throw new Error('build lib field required for the electron vite main config')
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

        const electornVer = getElectronMainVer(root)
        const nodeTarget = getElectronNodeTarget(electornVer)

        const defaultConfig = {
          build: {
            outDir: path.resolve(root, 'out', 'preload'),
            target: nodeTarget,
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
          if (!rollupOptions.output) {
            defaultConfig.build.rollupOptions.output['format'] = 'cjs'
          }
        }

        const buildConfig = mergeConfig(defaultConfig.build, config.build || {})
        config.build = buildConfig

        config.define = config.define || {}
        config.define = { ...processEnvDefine(), ...config.define }

        config.envPrefix = config.envPrefix || 'PRELOAD_VITE_'
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
              if (!formats.some(f => f !== 'cjs')) {
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

        const electornVer = getElectronMainVer(root)
        const chromeTarget = getElectronChromeTarget(electornVer)

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
            polyfillModulePreload: false,
            rollupOptions: {
              input: findInput(root),
              external: [...builtinModules.flatMap(m => [m, `node:${m}`])]
            },
            reportCompressedSize: false,
            minify: false,
            emptyOutDir: emptyOutDir()
          }
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
          if (targets.some(t => !t.startsWith('chrome'))) {
            throw new Error('the electron vite renderer config build target must be chrome')
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

export function electronConfigServeVitePlugin(options: {
  configFile: string
  configFileDependencies: string[]
}): Plugin {
  const getShortName = (file: string, root: string): string => {
    return file.startsWith(root + '/') ? path.posix.relative(root, file) : file
  }

  return {
    name: 'vite:electron-config-serve',
    apply: 'serve',
    handleHotUpdate({ file, server }): void {
      const { config } = server
      const logger = config.logger
      const shortFile = getShortName(file, config.root)
      const isConfig = file === options.configFile
      const isConfigDependency = options.configFileDependencies.some(name => file === path.resolve(name))
      if (isConfig || isConfigDependency) {
        logger.info(`[config change] ${colors.dim(shortFile)}`)
        logger.info(colors.green(`${path.relative(process.cwd(), file)} changed, restarting server...`), {
          clear: true,
          timestamp: true
        })
        try {
          server.restart()
        } catch (e) {
          logger.error(colors.red('failed to restart server'), { error: e as Error })
        }
      }
    }
  }
}

export function bytecodePlugin(options: BytecodeOptions = {}): Plugin | null {
  if (process.env.NODE_ENV_ELECTRON_VITE !== 'production') {
    return null
  }

  const { chunkAlias = [], transformArrowFunctions = true, removeBundleJS = true } = options
  const _chunkAlias = Array.isArray(chunkAlias) ? chunkAlias : [chunkAlias]
  const transformAllChunks = _chunkAlias.length === 0
  const bytecodeChunks: string[] = []
  const nonEntryChunks: string[] = []
  const _transform = (code: string): string => {
    const re = babel.transform(code, {
      plugins: ['@babel/plugin-transform-arrow-functions']
    })
    return re.code || ''
  }
  const requireBytecodeLoaderStr = '"use strict";\nrequire("./bytecode-loader.js");'
  let config: ResolvedConfig
  let useInRenderer = false
  let bytecodeFiles: { name: string; size: number }[] = []
  return {
    name: 'vite:bytecode',
    apply: 'build',
    enforce: 'post',
    configResolved(resolvedConfig): void {
      config = resolvedConfig
      useInRenderer = config.plugins.some(p => p.name === 'vite:electron-renderer-preset-config')
      if (useInRenderer) {
        config.logger.warn(colors.yellow('bytecodePlugin is not support renderers'))
      }
    },
    renderChunk(code, chunk): { code: string } | null {
      if (useInRenderer) {
        return null
      }
      if (!transformAllChunks) {
        const isBytecodeChunk = _chunkAlias.some(alias => chunk.fileName.startsWith(alias))
        if (isBytecodeChunk) {
          bytecodeChunks.push(chunk.fileName)
          if (!chunk.isEntry) {
            nonEntryChunks.push(chunk.fileName)
          }
          if (transformArrowFunctions) {
            return {
              code: _transform(code)
            }
          }
        }
      } else {
        if (chunk.type === 'chunk') {
          bytecodeChunks.push(chunk.fileName)
          if (!chunk.isEntry) {
            nonEntryChunks.push(chunk.fileName)
          }
          if (transformArrowFunctions) {
            return {
              code: _transform(code)
            }
          }
        }
      }
      return null
    },
    generateBundle(): void {
      if (!useInRenderer && bytecodeChunks.length) {
        this.emitFile({
          type: 'asset',
          source: bytecodeModuleLoaderCode.join('\n') + '\n',
          name: 'Bytecode Loader File',
          fileName: 'bytecode-loader.js'
        })
      }
    },
    async writeBundle(options, output): Promise<void> {
      if (useInRenderer || bytecodeChunks.length === 0) {
        return
      }
      const bundles = Object.keys(output)
      const outDir = options.dir!
      bytecodeFiles = []
      await Promise.all(
        bundles.map(async name => {
          const chunk = output[name]
          if (chunk.type === 'chunk') {
            let _code = chunk.code
            nonEntryChunks.forEach(bcc => {
              if (bcc !== name) {
                const reg = new RegExp(bcc, 'g')
                _code = _code.replace(reg, `${bcc}c`)
              }
            })
            const chunkFileName = path.resolve(outDir, name)
            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(_code)
              const bytecodeFileName = path.resolve(outDir, name + 'c')
              fs.writeFileSync(bytecodeFileName, bytecodeBuffer)
              if (chunk.isEntry) {
                if (!removeBundleJS) {
                  const newFileName = path.resolve(outDir, `_${name}`)
                  fs.renameSync(chunkFileName, newFileName)
                }
                const code = requireBytecodeLoaderStr + `\nrequire("./${normalizePath(name + 'c')}");\n`
                fs.writeFileSync(chunkFileName, code)
              } else {
                if (removeBundleJS) {
                  fs.unlinkSync(chunkFileName)
                } else {
                  const newFileName = path.resolve(outDir, `_${name}`)
                  fs.renameSync(chunkFileName, newFileName)
                }
              }
              bytecodeFiles.push({ name: name + 'c', size: bytecodeBuffer.length })
            } else {
              if (chunk.isEntry) {
                _code = _code.replace('"use strict";', requireBytecodeLoaderStr)
              }
              fs.writeFileSync(chunkFileName, _code)
            }
          }
        })
      )
    },
    closeBundle(): void {
      if (!useInRenderer) {
        const chunkLimit = config.build.chunkSizeWarningLimit
        const outDir = normalizePath(path.relative(config.root, path.resolve(config.root, config.build.outDir))) + '/'
        config.logger.info(`${colors.green(`✓`)} ${bytecodeFiles.length} bundles compiled into bytecode.`)
        let longest = 0
        bytecodeFiles.forEach(file => {
          const len = file.name.length
          if (len > longest) longest = len
        })
        bytecodeFiles.forEach(file => {
          const kibs = file.size / 1024
          config.logger.info(
            `${colors.gray(colors.white(colors.dim(outDir)))}${colors.green(file.name.padEnd(longest + 2))} ${
              kibs > chunkLimit ? colors.yellow(`${kibs.toFixed(2)} KiB`) : colors.dim(`${kibs.toFixed(2)} KiB`)
            }`
          )
        })
        bytecodeFiles = []
      }
    }
  }
}

function getElectronMainVer(root: string): string {
  let mainVer = process.env.ELECTRON_MAIN_VER || ''
  if (!mainVer) {
    const electronModulePath = path.resolve(root, 'node_modules', 'electron')
    const pkg = path.join(electronModulePath, 'package.json')
    if (fs.existsSync(pkg)) {
      const require = createRequire(import.meta.url)
      const version = require(pkg).version
      mainVer = version.split('.')[0]
      process.env.ELECTRON_MAIN_VER = mainVer
    }
  }
  return mainVer
}

function getElectronNodeTarget(electronVer: string): string {
  const nodeVer = {
    '21': '16.16',
    '20': '16.15',
    '19': '16.14',
    '18': '16.13',
    '17': '16.13',
    '16': '16.9',
    '15': '16.5',
    '14': '14.17',
    '13': '14.17',
    '12': '14.16',
    '11': '12.18'
  }
  if (electronVer && parseInt(electronVer) > 10) {
    let target = nodeVer[electronVer]
    if (!target) target = Object.values(nodeVer).reverse()[0]
    return 'node' + target
  }
  return ''
}

function getElectronChromeTarget(electronVer: string): string {
  const chromeVer = {
    '21': '106',
    '20': '104',
    '19': '102',
    '18': '100',
    '17': '98',
    '16': '96',
    '15': '94',
    '14': '93',
    '13': '91',
    '12': '89',
    '11': '87'
  }
  if (electronVer && parseInt(electronVer) > 10) {
    let target = chromeVer[electronVer]
    if (!target) target = Object.values(chromeVer).reverse()[0]
    return 'chrome' + target
  }
  return ''
}
