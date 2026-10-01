import path from 'node:path'
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
import { isObject, isFilePathESM, cloneConfig, asyncFlatten } from './utils'
import { findConfigFile, bundleConfigFile, loadConfigFormBundledFile } from './load'

export { defineConfig as defineViteConfig } from 'vite'

interface IsolatedEntriesMixin {
  /**
   * Build each entry point as an isolated bundle without code splitting.
   *
   * When enabled, each entry will include all its dependencies inline,
   * preventing automatic code splitting across entries and ensuring each
   * output file is fully standalone.
   *
   * **Important**: When using `isolatedEntries` in `preload` config, you
   * should also disable `build.externalizeDeps` to ensure third-party dependencies
   * from `node_modules` are bundled together, which is required for Electron
   * sandbox support.
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
   * https://electron-vite.org/guide/source-code-protection#options
   *
   * Compiles source code to v8 bytecode and works only in the `build` command.
   */
  bytecode?: boolean | BytecodeOptions
}

interface MainBuildOptions extends ViteBuildOptions, ExternalizeDepsMixin, BytecodeMixin {}

interface PreloadBuildOptions extends ViteBuildOptions, ExternalizeDepsMixin, BytecodeMixin, IsolatedEntriesMixin {}

interface RendererBuildOptions extends ViteBuildOptions, IsolatedEntriesMixin {}

interface BaseViteConfig<T> extends Omit<ViteConfig, 'build'> {
  /**
   * Build specific options
   */
  build?: T
}

export interface MainViteConfig extends BaseViteConfig<MainBuildOptions> {}

export interface PreloadViteConfig extends BaseViteConfig<PreloadBuildOptions> {}

export interface RendererViteConfig extends BaseViteConfig<RendererBuildOptions> {}

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
  UserConfig | Promise<UserConfig> | ElectronViteConfigFnObject | ElectronViteConfigFnPromise | ElectronViteConfigFn

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

  const userConfig: UserConfig | undefined = {}

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

      const { main, preload, renderer } = loadResult.config

      if (main) {
        userConfig.main = await new MainConfigFactory(main, config, { outDir, root }).build()
      }

      if (preload) {
        userConfig.preload = await new PreloadConfigFactory(preload, config, { outDir, root }).build()
      }

      if (renderer) {
        userConfig.renderer = await new RendererConfigFactory(renderer, config, { outDir, root }).build()
      }

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

export abstract class ConfigFactory<T extends MainViteConfig | PreloadViteConfig | RendererViteConfig> {
  constructor(
    protected readonly baseConfig: T,
    protected readonly inlineConfig: InlineConfig,
    protected readonly options: { outDir?: string; root?: string }
  ) {
    baseConfig.build ??= {}
    baseConfig.build.rolldownOptions ??= baseConfig.build.rollupOptions
  }

  async build(cleanMode?: boolean): Promise<T> {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const config = mergeConfig(cloneConfig(this.baseConfig) as any, cloneConfig(this.inlineConfig)) as T

    config.mode = this.inlineConfig.mode || config.mode || process.env.NODE_ENV

    if (this.options.outDir) {
      resetOutDir(config, this.options.outDir, this.processType())
    }

    const builtinPlugins = await this.resolveBuiltinPlugins(config, cleanMode)

    config.plugins = builtinPlugins.concat(config.plugins || [])

    return config
  }

  protected abstract processType(): 'main' | 'preload' | 'renderer'

  protected abstract resolveBuiltinPlugins(config: T, cleanMode?: boolean): Promise<PluginOption[]>
}

export class MainConfigFactory extends ConfigFactory<MainViteConfig> {
  protected processType(): 'main' {
    return 'main'
  }

  protected async resolveBuiltinPlugins(config: MainViteConfig, cleanMode?: boolean): Promise<PluginOption[]> {
    const configDrivenPlugins: PluginOption[] = await resolveConfigDrivenPlugins(config)

    return cleanMode
      ? [
          electronMainConfigPresetPlugin({ root: this.options.root }),
          assetPlugin(),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins
        ]
      : [
          electronMainConfigPresetPlugin({ root: this.options.root }),
          electronMainConfigValidatorPlugin(),
          assetPlugin(),
          workerPlugin(),
          modulePathPlugin(this),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins
        ]
  }
}

export class PreloadConfigFactory extends ConfigFactory<PreloadViteConfig> {
  protected processType(): 'preload' {
    return 'preload'
  }

  protected async resolveBuiltinPlugins(config: PreloadViteConfig, cleanMode?: boolean): Promise<PluginOption[]> {
    const configDrivenPlugins: PluginOption[] = await resolveConfigDrivenPlugins(config)

    return cleanMode
      ? [
          electronPreloadConfigPresetPlugin({ root: this.options.root }),
          assetPlugin(),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins
        ]
      : [
          electronPreloadConfigPresetPlugin({ root: this.options.root }),
          electronPreloadConfigValidatorPlugin(),
          assetPlugin(),
          importMetaPlugin(),
          esmShimPlugin(),
          ...configDrivenPlugins,
          ...(config.build?.isolatedEntries ? [isolateEntriesPlugin(this)] : [])
        ]
  }
}

export class RendererConfigFactory extends ConfigFactory<RendererViteConfig> {
  protected processType(): 'renderer' {
    return 'renderer'
  }

  protected async resolveBuiltinPlugins(config: RendererViteConfig, cleanMode?: boolean): Promise<PluginOption[]> {
    return cleanMode
      ? [electronRendererConfigPresetPlugin({ root: this.options.root })]
      : [
          electronRendererConfigPresetPlugin({ root: this.options.root }),
          electronRendererConfigValidatorPlugin(),
          ...(config.build?.isolatedEntries ? [isolateEntriesPlugin(this)] : [])
        ]
  }
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

  const resolvedPath = configFile ? path.resolve(configFile) : findConfigFile(configRoot)

  if (!resolvedPath) {
    return {
      path: '',
      config: { main: {}, preload: {}, renderer: {} },
      dependencies: []
    }
  }

  const isESM = isFilePathESM(resolvedPath)

  try {
    const { code, dependencies } = await bundleConfigFile(resolvedPath, isESM)
    const configExport = await loadConfigFormBundledFile<ElectronViteConfigExport>(resolvedPath, code, isESM)

    const config = await (typeof configExport === 'function' ? configExport(configEnv) : configExport)
    if (!isObject(config)) {
      throw new Error(`config must export or return an object`)
    }

    if (!ignoreConfigWarning) {
      const missingFields = ['main', 'renderer', 'preload'].filter(field => !config[field])
      if (missingFields.length > 0) {
        createLogger(logLevel).warn(
          `${colors.yellow(colors.bold('(!)'))} ${colors.yellow(`${missingFields.join(' and ')} config is missing`)}\n`
        )
      }
    }

    return {
      path: normalizePath(resolvedPath),
      config,
      dependencies
    }
  } catch (e) {
    createLogger(logLevel).error(colors.red(`failed to load config from ${resolvedPath}`), { error: e as Error })
    throw e
  }
}
