import * as path from 'path'
import * as fs from 'fs'
import colors from 'picocolors'
import {
  UserConfig as ViteConfig,
  UserConfigExport as UserViteConfigExport,
  ConfigEnv,
  Plugin,
  LogLevel,
  createLogger,
  mergeConfig,
  normalizePath
} from 'vite'
import { build } from 'esbuild'

import { electronMainVitePlugin, electronPreloadVitePlugin, electronRendererVitePlugin } from './plugin'
import { isObject, dynamicImport } from './utils'

export { defineConfig as defineViteConfig } from 'vite'

export interface UserConfig {
  /**
   * Vite config options for electron main process
   *
   * https://cn.vitejs.dev/config/
   */
  main?: ViteConfig & { configFile?: string | false }
  /**
   * Vite config options for electron renderer process
   *
   * https://cn.vitejs.dev/config/
   */
  renderer?: ViteConfig & { configFile?: string | false }
  /**
   * Vite config options for electron preload files
   *
   * https://cn.vitejs.dev/config/
   */
  preload?: ViteConfig & { configFile?: string | false }
}

export interface UserConfigSchema {
  /**
   * Vite config options for electron main process
   *
   * https://cn.vitejs.dev/config/
   */
  main?: UserViteConfigExport
  /**
   * Vite config options for electron renderer process
   *
   * https://cn.vitejs.dev/config/
   */
  renderer?: UserViteConfigExport
  /**
   * Vite config options for electron preload files
   *
   * https://cn.vitejs.dev/config/
   */
  preload?: UserViteConfigExport
}

export type InlineConfig = Omit<ViteConfig, 'base'> & {
  configFile?: string | false
  envFile?: false
  ignoreConfigWarning?: boolean
}

export type UserConfigExport = UserConfigSchema | Promise<UserConfigSchema>

/**
 * Type helper to make it easier to use `electron.vite.config.ts`
 * accepts a direct {@link UserConfig} object, or a function that returns it.
 */
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}

export interface ResolvedConfig {
  config?: UserConfig
  configFile?: string
  configFileDependencies: string[]
}

export async function resolveConfig(
  inlineConfig: InlineConfig,
  command: 'build' | 'serve',
  defaultMode = 'development'
): Promise<ResolvedConfig> {
  const config = inlineConfig
  const mode = inlineConfig.mode || defaultMode

  config.mode = mode

  if (mode === 'production') {
    process.env.NODE_ENV = 'production'
  }

  let userConfig: UserConfig | undefined
  let configFileDependencies: string[] = []

  let { configFile } = config
  if (configFile !== false) {
    const configEnv = {
      mode,
      command
    }
    const loadResult = await loadConfigFromFile(
      configEnv,
      configFile,
      config.root,
      config.logLevel,
      config.ignoreConfigWarning
    )
    if (loadResult) {
      const root = config.root
      delete config.root
      delete config.configFile

      const outDir = config.build?.outDir

      if (loadResult.config.main) {
        const mainViteConfig: ViteConfig = mergeConfig(loadResult.config.main, deepClone(config))

        if (outDir) {
          resetOutDir(mainViteConfig, outDir, 'main')
        }

        mergePlugins(mainViteConfig, electronMainVitePlugin({ root }))

        loadResult.config.main = mainViteConfig
        loadResult.config.main.configFile = false
      }

      if (loadResult.config.preload) {
        const preloadViteConfig: ViteConfig = mergeConfig(loadResult.config.preload, deepClone(config))

        if (outDir) {
          resetOutDir(preloadViteConfig, outDir, 'preload')
        }
        mergePlugins(preloadViteConfig, electronPreloadVitePlugin({ root }))

        loadResult.config.preload = preloadViteConfig
        loadResult.config.preload.configFile = false
      }

      if (loadResult.config.renderer) {
        const rendererViteConfig: ViteConfig = mergeConfig(loadResult.config.renderer, deepClone(config))

        if (outDir) {
          resetOutDir(rendererViteConfig, outDir, 'renderer')
        }

        mergePlugins(rendererViteConfig, electronRendererVitePlugin({ root }))

        loadResult.config.renderer = rendererViteConfig
        loadResult.config.renderer.configFile = false
      }

      userConfig = loadResult.config
      configFile = loadResult.path
      configFileDependencies = loadResult.dependencies
    }
  }

  const resolved: ResolvedConfig = {
    config: userConfig,
    configFile: configFile ? normalizePath(configFile) : undefined,
    configFileDependencies
  }

  return resolved
}

function deepClone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

function resetOutDir(config: ViteConfig, outDir: string, subOutDir: string): void {
  let userOutDir = config.build?.outDir
  if (outDir === userOutDir) {
    userOutDir = path.resolve(config.root || process.cwd(), outDir, subOutDir)
    if (config.build) {
      config.build.outDir = userOutDir
    } else {
      config.build = { outDir: userOutDir }
    }
  }
}

function mergePlugins(config: ViteConfig, plugins: Plugin[]): void {
  const userPlugins = config.plugins || []
  config.plugins = userPlugins.concat(plugins)
}

const CONFIG_FILE_NAME = 'electron.vite.config'

export async function loadConfigFromFile(
  configEnv: ConfigEnv,
  configFile?: string,
  configRoot: string = process.cwd(),
  logLevel?: LogLevel,
  ignoreConfigWarning = false
): Promise<{
  path: string
  config: UserConfig
  dependencies: string[]
}> {
  let resolvedPath: string
  let isESM = false

  if (configFile && /^vite.config.(js)|(ts)|(mjs)|(cjs)$/.test(configFile)) {
    throw new Error(`config file cannot be named ${configFile}.`)
  }

  resolvedPath = configFile ? path.resolve(configFile) : findConfigFile(configRoot, ['js', 'ts', 'mjs', 'cjs'])

  if (!resolvedPath) {
    return {
      path: '',
      config: { main: {}, preload: {}, renderer: {} },
      dependencies: []
    }
  }

  if (resolvedPath.endsWith('.mjs')) {
    isESM = true
  }

  if (resolvedPath.endsWith('.js')) {
    const pkg = path.join(configRoot, 'package.json')
    if (fs.existsSync(pkg)) {
      isESM = require(pkg).type === 'module'
    }
  }

  const configFilePath = resolvedPath

  try {
    const bundled = await bundleConfigFile(resolvedPath)

    if (!isESM) {
      resolvedPath = path.resolve(configRoot, `${CONFIG_FILE_NAME}.mjs`)
      fs.writeFileSync(resolvedPath, bundled.code)
    }

    const fileUrl = require('url').pathToFileURL(resolvedPath)

    const userConfig = (await dynamicImport(fileUrl)).default

    if (!isESM) {
      fs.unlinkSync(resolvedPath)
    }

    const config = await (typeof userConfig === 'function' ? userConfig() : userConfig)
    if (!isObject(config)) {
      throw new Error(`config must export or return an object`)
    }

    const configRequired: string[] = []

    let mainConfig
    if (config.main) {
      const mainViteConfig = config.main
      mainConfig = await (typeof mainViteConfig === 'function' ? mainViteConfig(configEnv) : mainViteConfig)
      if (!isObject(mainConfig)) {
        throw new Error(`main config must export or return an object`)
      }
    } else {
      configRequired.push('main')
    }

    let rendererConfig
    if (config.renderer) {
      const rendererViteConfig = config.renderer
      rendererConfig = await (typeof rendererViteConfig === 'function'
        ? rendererViteConfig(configEnv)
        : rendererViteConfig)
      if (!isObject(rendererConfig)) {
        throw new Error(`renderer config must export or return an object`)
      }
    } else {
      configRequired.push('renderer')
    }

    let preloadConfig
    if (config.preload) {
      const preloadViteConfig = config.preload
      preloadConfig = await (typeof preloadViteConfig === 'function' ? preloadViteConfig(configEnv) : preloadViteConfig)
      if (!isObject(preloadViteConfig)) {
        throw new Error(`preload config must export or return an object`)
      }
    } else {
      configRequired.push('preload')
    }

    if (!ignoreConfigWarning && configRequired.length > 0) {
      createLogger(logLevel).warn(colors.yellow(`${configRequired.join(' and ')} config is missing`))
    }

    return {
      path: normalizePath(configFilePath),
      config: {
        main: mainConfig,
        renderer: rendererConfig,
        preload: preloadConfig
      },
      dependencies: bundled.dependencies
    }
  } catch (e) {
    createLogger(logLevel).error(colors.red(`failed to load config from ${configFilePath}`), { error: e as Error })
    throw e
  }
}

function findConfigFile(configRoot: string, extensions: string[]): string {
  for (const ext of extensions) {
    const configFile = path.resolve(configRoot, `${CONFIG_FILE_NAME}.${ext}`)
    if (fs.existsSync(configFile)) {
      return configFile
    }
  }
  return ''
}

async function bundleConfigFile(fileName: string): Promise<{ code: string; dependencies: string[] }> {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [fileName],
    write: false,
    platform: 'node',
    bundle: true,
    format: 'esm',
    sourcemap: false,
    metafile: true,
    plugins: [
      {
        name: 'externalize-deps',
        setup(build): void {
          build.onResolve({ filter: /.*/ }, args => {
            const id = args.path
            if (id[0] !== '.' && !path.isAbsolute(id)) {
              return {
                external: true
              }
            }
            return null
          })
        }
      },
      {
        name: 'replace-import-meta',
        setup(build): void {
          build.onLoad({ filter: /\.[jt]s$/ }, async args => {
            const contents = await fs.promises.readFile(args.path, 'utf8')
            return {
              loader: args.path.endsWith('.ts') ? 'ts' : 'js',
              contents: contents
                .replace(/\bimport\.meta\.url\b/g, JSON.stringify(`file://${args.path}`))
                .replace(/\b__dirname\b/g, JSON.stringify(path.dirname(args.path)))
                .replace(/\b__filename\b/g, JSON.stringify(args.path))
            }
          })
        }
      }
    ]
  })
  const { text } = result.outputFiles[0]
  return {
    code: text,
    dependencies: result.metafile ? Object.keys(result.metafile.inputs) : []
  }
}
