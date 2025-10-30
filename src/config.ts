import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import colors from 'picocolors'
import {
  type UserConfig as ViteConfig,
  type ConfigEnv,
  type PluginOption,
  type Plugin,
  type BuildEnvironmentOptions as ViteBuildOptions,
  type LogLevel,
  createLogger,
  mergeConfig,
  normalizePath
} from 'vite'
import { build } from 'esbuild'

import {
  electronMainConfigPresetPlugin,
  electronMainConfigValidatorPlugin,
  electronPreloadConfigPresetPlugin,
  electronPreloadConfigValidatorPlugin,
  electronRendererConfigPresetPlugin,
  electronRendererConfigValidatorPlugin
} from './plugins/electron'
import assetPlugin from './plugins/asset'
import workerPlugin from './plugins/worker'
import importMetaPlugin from './plugins/importMeta'
import esmShimPlugin from './plugins/esmShim'
import modulePathPlugin from './plugins/modulePath'
import isolateEntriesPlugin from './plugins/isolateEntries'
import { type ExternalOptions, externalizeDepsPlugin } from './plugins/externalizeDeps'
import { type BytecodeOptions, bytecodePlugin } from './plugins/bytecode'
import { isObject, isFilePathESM, deepClone, asyncFlatten } from './utils'

export { defineConfig as defineViteConfig } from 'vite'

interface IsolatedEntriesOption {
  /**
   * Build each entry point as an isolated bundle without code splitting.
   *
   * When enabled, each entry will include all its dependencies inline,
   * preventing automatic code splitting across entries and ensuring each
   * output file is fully standalone.
   *
   * @experimental
   * @default false
   */
  isolatedEntries?: boolean
}

interface ExternalizeDepsMixin {
  /**
   * Options pass on to `externalizeDeps` plugin in electron-vite.
   *
   * Automatically externalize dependencies.
   *
   * @default true
   */
  externalizeDeps?: boolean | ExternalOptions
}

interface BytecodeMixin {
  /**
   * Options pass on to `bytecode` plugin in electron-vite.
   * https://electron-vite.org/guide/source-code-protection#bytecodeplugin-options
   *
   * Compile source code to v8 bytecode.
   */
  bytecode?: boolean | BytecodeOptions
}

interface MainBuildOptions extends ViteBuildOptions, ExternalizeDepsMixin, BytecodeMixin {}

interface PreloadBuildOptions extends ViteBuildOptions, ExternalizeDepsMixin, BytecodeMixin {}

interface RendererBuildOptions extends ViteBuildOptions {}

interface BaseViteConfig<T> extends Omit<ViteConfig, 'build'> {
  /**
   * Build specific options
   */
  build?: T
}

export interface MainViteConfig extends BaseViteConfig<MainBuildOptions> {}

export interface PreloadViteConfig extends BaseViteConfig<PreloadBuildOptions>, IsolatedEntriesOption {}

export interface RendererViteConfig extends BaseViteConfig<RendererBuildOptions>, IsolatedEntriesOption {}

export interface UserConfig {
  /**
   * Vite config options for electron main process
   *
   * @see https://vitejs.dev/config/
   */
  main?: MainViteConfig
  /**
   * Vite config options for electron renderer process
   *
   * @see https://vitejs.dev/config/
   */
  renderer?: RendererViteConfig
  /**
   * Vite config options for electron preload scripts
   *
   * @see https://vitejs.dev/config/
   */
  preload?: PreloadViteConfig
}

export type ElectronViteConfigFnObject = (env: ConfigEnv) => UserConfig
export type ElectronViteConfigFnPromise = (env: ConfigEnv) => Promise<UserConfig>
export type ElectronViteConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>

export type ElectronViteConfigExport =
  | UserConfig
  | Promise<UserConfig>
  | ElectronViteConfigFnObject
  | ElectronViteConfigFnPromise
  | ElectronViteConfigFn

/**
 * Type helper to make it easier to use `electron.vite.config.*`
 * accepts a direct {@link UserConfig} object, or a function that returns it.
 * The function receives a object that exposes two properties:
 * `command` (either `'build'` or `'serve'`), and `mode`.
 */
export function defineConfig(config: UserConfig): UserConfig
export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>
export function defineConfig(config: ElectronViteConfigFnObject): ElectronViteConfigFnObject
export function defineConfig(config: ElectronViteConfigFnPromise): ElectronViteConfigFnPromise
export function defineConfig(config: ElectronViteConfigExport): ElectronViteConfigExport
export function defineConfig(config: ElectronViteConfigExport): ElectronViteConfigExport {
  return config
}

export type InlineConfig = Omit<ViteConfig, 'base'> & {
  configFile?: string | false
  envFile?: false
  ignoreConfigWarning?: boolean
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

  process.env.NODE_ENV = defaultMode

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

      config.configFile = false

      const outDir = config.build?.outDir

      if (loadResult.config.main) {
        const mainViteConfig: MainViteConfig = mergeConfig(loadResult.config.main, deepClone(config))

        mainViteConfig.mode = inlineConfig.mode || mainViteConfig.mode || defaultMode

        if (outDir) {
          resetOutDir(mainViteConfig, outDir, 'main')
        }

        const configDrivenPlugins: PluginOption[] = await resolveConfigDrivenPlugins(mainViteConfig)

        const builtInMainPlugins: PluginOption[] = [
          electronMainConfigPresetPlugin({ root }),
          electronMainConfigValidatorPlugin(),
          assetPlugin(),
          workerPlugin(),
          modulePathPlugin(
            mergeConfig(
              {
                plugins: [
                  electronMainConfigPresetPlugin({ root }),
                  assetPlugin(),
                  importMetaPlugin(),
                  esmShimPlugin(),
                  ...configDrivenPlugins
                ]
              },
              mainViteConfig
            )
          ),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins
        ]

        mainViteConfig.plugins = builtInMainPlugins.concat(mainViteConfig.plugins || [])

        loadResult.config.main = mainViteConfig
      }

      if (loadResult.config.preload) {
        const preloadViteConfig: PreloadViteConfig = mergeConfig(loadResult.config.preload, deepClone(config))

        preloadViteConfig.mode = inlineConfig.mode || preloadViteConfig.mode || defaultMode

        if (outDir) {
          resetOutDir(preloadViteConfig, outDir, 'preload')
        }

        const configDrivenPlugins: PluginOption[] = await resolveConfigDrivenPlugins(preloadViteConfig)

        const builtInPreloadPlugins: PluginOption[] = [
          electronPreloadConfigPresetPlugin({ root }),
          electronPreloadConfigValidatorPlugin(),
          assetPlugin(),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins
        ]

        if (preloadViteConfig.isolatedEntries) {
          builtInPreloadPlugins.push(
            isolateEntriesPlugin(
              mergeConfig(
                {
                  plugins: [
                    electronPreloadConfigPresetPlugin({ root }),
                    assetPlugin(),
                    importMetaPlugin(),
                    esmShimPlugin(),
                    ...configDrivenPlugins
                  ]
                },
                preloadViteConfig
              )
            )
          )
        }

        preloadViteConfig.plugins = builtInPreloadPlugins.concat(preloadViteConfig.plugins)

        loadResult.config.preload = preloadViteConfig
      }

      if (loadResult.config.renderer) {
        const rendererViteConfig: RendererViteConfig = mergeConfig(loadResult.config.renderer, deepClone(config))

        rendererViteConfig.mode = inlineConfig.mode || rendererViteConfig.mode || defaultMode

        if (outDir) {
          resetOutDir(rendererViteConfig, outDir, 'renderer')
        }

        const builtInRendererPlugins: PluginOption[] = [
          electronRendererConfigPresetPlugin({ root }),
          electronRendererConfigValidatorPlugin()
        ]

        if (rendererViteConfig.isolatedEntries) {
          builtInRendererPlugins.push(
            isolateEntriesPlugin(
              mergeConfig(
                {
                  plugins: [electronRendererConfigPresetPlugin({ root })]
                },
                rendererViteConfig
              )
            )
          )
        }

        rendererViteConfig.plugins = builtInRendererPlugins.concat(rendererViteConfig.plugins || [])

        loadResult.config.renderer = rendererViteConfig
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

async function resolveConfigDrivenPlugins(config: MainViteConfig | PreloadViteConfig): Promise<PluginOption[]> {
  const userPlugins = (await asyncFlatten(config.plugins || [])).filter(Boolean) as Plugin[]

  const configDrivenPlugins: PluginOption[] = []

  const hasExternalizeDepsPlugin = userPlugins.some(p => p.name === 'vite:externalize-deps')
  if (!hasExternalizeDepsPlugin) {
    const externalOptions = config.build?.externalizeDeps ?? true
    if (externalOptions) {
      isOptions<ExternalOptions>(externalOptions)
        ? configDrivenPlugins.push(externalizeDepsPlugin(externalOptions))
        : configDrivenPlugins.push(externalizeDepsPlugin())
    }
  }

  const hasBytecodePlugin = userPlugins.some(p => p.name === 'vite:bytecode')
  if (!hasBytecodePlugin) {
    const bytecodeOptions = config.build?.bytecode
    if (bytecodeOptions) {
      isOptions<BytecodeOptions>(bytecodeOptions)
        ? configDrivenPlugins.push(bytecodePlugin(bytecodeOptions))
        : configDrivenPlugins.push(bytecodePlugin())
    }
  }

  return configDrivenPlugins
}

function isOptions<T extends object>(value: boolean | T): value is T {
  return typeof value === 'object' && value !== null
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
  if (configFile && /^vite.config.(js|ts|mjs|cjs|mts|cts)$/.test(configFile)) {
    throw new Error(`config file cannot be named ${configFile}.`)
  }

  const resolvedPath = configFile
    ? path.resolve(configFile)
    : findConfigFile(configRoot, ['js', 'ts', 'mjs', 'cjs', 'mts', 'cts'])

  if (!resolvedPath) {
    return {
      path: '',
      config: { main: {}, preload: {}, renderer: {} },
      dependencies: []
    }
  }

  const isESM = isFilePathESM(resolvedPath)

  try {
    const bundled = await bundleConfigFile(resolvedPath, isESM)
    const userConfig = await loadConfigFormBundledFile(configRoot, resolvedPath, bundled.code, isESM)

    const config = await (typeof userConfig === 'function' ? userConfig(configEnv) : userConfig)
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
      if (!isObject(preloadConfig)) {
        throw new Error(`preload config must export or return an object`)
      }
    } else {
      configRequired.push('preload')
    }

    if (!ignoreConfigWarning && configRequired.length > 0) {
      createLogger(logLevel).warn(colors.yellow(`${configRequired.join(' and ')} config is missing`))
    }

    return {
      path: normalizePath(resolvedPath),
      config: {
        main: mainConfig,
        renderer: rendererConfig,
        preload: preloadConfig
      },
      dependencies: bundled.dependencies
    }
  } catch (e) {
    createLogger(logLevel).error(colors.red(`failed to load config from ${resolvedPath}`), { error: e as Error })
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

async function bundleConfigFile(fileName: string, isESM: boolean): Promise<{ code: string; dependencies: string[] }> {
  const dirnameVarName = '__electron_vite_injected_dirname'
  const filenameVarName = '__electron_vite_injected_filename'
  const importMetaUrlVarName = '__electron_vite_injected_import_meta_url'
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [fileName],
    write: false,
    target: ['node20'],
    platform: 'node',
    bundle: true,
    format: isESM ? 'esm' : 'cjs',
    sourcemap: false,
    metafile: true,
    define: {
      __dirname: dirnameVarName,
      __filename: filenameVarName,
      'import.meta.url': importMetaUrlVarName
    },
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
          build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async args => {
            const contents = await fs.promises.readFile(args.path, 'utf8')
            const injectValues =
              `const ${dirnameVarName} = ${JSON.stringify(path.dirname(args.path))};` +
              `const ${filenameVarName} = ${JSON.stringify(args.path)};` +
              `const ${importMetaUrlVarName} = ${JSON.stringify(pathToFileURL(args.path).href)};`

            return {
              loader: args.path.endsWith('ts') ? 'ts' : 'js',
              contents: injectValues + contents
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

interface NodeModuleWithCompile extends NodeModule {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  _compile(code: string, filename: string): any
}

const _require = createRequire(import.meta.url)
async function loadConfigFormBundledFile(
  configRoot: string,
  configFile: string,
  bundledCode: string,
  isESM: boolean
): Promise<ElectronViteConfigExport> {
  if (isESM) {
    const fileNameTmp = path.resolve(configRoot, `${CONFIG_FILE_NAME}.${Date.now()}.mjs`)
    fs.writeFileSync(fileNameTmp, bundledCode)

    const fileUrl = pathToFileURL(fileNameTmp)
    try {
      return (await import(fileUrl.href)).default
    } finally {
      try {
        fs.unlinkSync(fileNameTmp)
      } catch {}
    }
  } else {
    const extension = path.extname(configFile)
    const realFileName = fs.realpathSync(configFile)
    const loaderExt = extension in _require.extensions ? extension : '.js'
    const defaultLoader = _require.extensions[loaderExt]!
    _require.extensions[loaderExt] = (module: NodeModule, filename: string): void => {
      if (filename === realFileName) {
        ;(module as NodeModuleWithCompile)._compile(bundledCode, filename)
      } else {
        defaultLoader(module, filename)
      }
    }
    delete _require.cache[_require.resolve(configFile)]
    const raw = _require(configFile)
    _require.extensions[loaderExt] = defaultLoader
    return raw.__esModule ? raw.default : raw
  }
}
