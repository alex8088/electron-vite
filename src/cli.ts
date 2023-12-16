import { cac } from 'cac'
import colors from 'picocolors'
import { LogLevel, createLogger } from 'vite'
import { InlineConfig } from './config'
import { version } from '../package.json'

const cli = cac('electron-vite')

// global options
interface GlobalCLIOptions {
  '--'?: string[]
  c?: boolean | string
  config?: string
  l?: LogLevel
  logLevel?: LogLevel
  clearScreen?: boolean
  d?: boolean | string
  debug?: boolean | string
  f?: string
  filter?: string
  m?: string
  mode?: string
  ignoreConfigWarning?: boolean
  sourcemap?: boolean
  w?: boolean
  watch?: boolean
  outDir?: string
  entry?: string
}

interface DevCLIOptions {
  inspect?: boolean | string
  inspectBrk?: boolean | string
  remoteDebuggingPort?: string
  noSandbox?: boolean
  rendererOnly?: boolean
}

interface PreviewCLIOptions {
  noSandbox?: boolean
  skipBuild?: boolean
}

function createInlineConfig(root: string, options: GlobalCLIOptions): InlineConfig {
  return {
    root,
    mode: options.mode,
    configFile: options.config,
    logLevel: options.logLevel,
    clearScreen: options.clearScreen,
    ignoreConfigWarning: options.ignoreConfigWarning,
    build: {
      sourcemap: options.sourcemap,
      outDir: options.outDir,
      ...(options.w || options.watch ? { watch: {} } : null)
    }
  }
}

cli
  .option('-c, --config <file>', `[string] use specified config file`)
  .option('-l, --logLevel <level>', `[string] info | warn | error | silent`)
  .option('--clearScreen', `[boolean] allow/disable clear screen when logging`)
  .option('-d, --debug [feat]', `[string | boolean] show debug logs`)
  .option('-f, --filter <filter>', `[string] filter debug logs`)
  .option('-m, --mode <mode>', `[string] set env mode`)
  .option('--ignoreConfigWarning', `[boolean] ignore config warning`)
  .option('--sourcemap', `[boolean] output source maps for debug (default: false)`)
  .option('--outDir <dir>', `[string] output directory (default: out)`)
  .option('--entry <file>', `[string] specify electron entry file`)

// dev
cli
  .command('[root]', 'start dev server and electron app')
  .alias('serve')
  .alias('dev')
  .option('-w, --watch', `[boolean] rebuilds when main process or preload script modules have changed on disk`)
  .option('--inspect [port]', `[boolean | number] enable V8 inspector on the specified port`)
  .option('--inspectBrk [port]', `[boolean | number] enable V8 inspector on the specified port`)
  .option('--remoteDebuggingPort <port>', `[string] port for remote debugging`)
  .option('--noSandbox', `[boolean] forces renderer process to run un-sandboxed`)
  .option('--rendererOnly', `[boolean] only dev server for the renderer`)
  .action(async (root: string, options: DevCLIOptions & GlobalCLIOptions) => {
    if (options.remoteDebuggingPort) {
      process.env.REMOTE_DEBUGGING_PORT = options.remoteDebuggingPort
    }

    if (options.inspect) {
      process.env.V8_INSPECTOR_PORT = typeof options.inspect === 'number' ? `${options.inspect}` : '5858'
    }

    if (options.inspectBrk) {
      process.env.V8_INSPECTOR_BRK_PORT = typeof options.inspectBrk === 'number' ? `${options.inspectBrk}` : '5858'
    }

    if (options.noSandbox) {
      process.env.NO_SANDBOX = '1'
    }

    if (options['--']) {
      process.env.ELECTRON_CLI_ARGS = JSON.stringify(options['--'])
    }

    if (options.entry) {
      process.env.ELECTRON_ENTRY = options.entry
    }

    const { createServer } = await import('./server')
    const inlineConfig = createInlineConfig(root, options)

    try {
      await createServer(inlineConfig, { rendererOnly: options.rendererOnly })
    } catch (e) {
      const error = e as Error
      createLogger(options.logLevel).error(
        colors.red(`error during start dev server and electron app:\n${error.stack}`),
        { error }
      )
      process.exit(1)
    }
  })

// build
cli.command('build [root]', 'build for production').action(async (root: string, options: GlobalCLIOptions) => {
  const { build } = await import('./build')
  const inlineConfig = createInlineConfig(root, options)

  if (options.entry) {
    process.env.ELECTRON_ENTRY = options.entry
  }

  try {
    await build(inlineConfig)
  } catch (e) {
    const error = e as Error
    createLogger(options.logLevel).error(colors.red(`error during build:\n${error.stack}`), { error })
    process.exit(1)
  }
})

// preview
cli
  .command('preview [root]', 'start electron app to preview production build')
  .option('--noSandbox', `[boolean] forces renderer process to run un-sandboxed`)
  .option('--skipBuild', `[boolean] skip build`)
  .action(async (root: string, options: PreviewCLIOptions & GlobalCLIOptions) => {
    const { preview } = await import('./preview')
    const inlineConfig = createInlineConfig(root, options)

    if (options.noSandbox) {
      process.env.NO_SANDBOX = '1'
    }

    if (options.entry) {
      process.env.ELECTRON_ENTRY = options.entry
    }

    if (options['--']) {
      process.env.ELECTRON_CLI_ARGS = JSON.stringify(options['--'])
    }

    try {
      await preview(inlineConfig, { skipBuild: options.skipBuild })
    } catch (e) {
      const error = e as Error
      createLogger(options.logLevel).error(colors.red(`error during preview electron app:\n${error.stack}`), { error })
      process.exit(1)
    }
  })

cli.help()
cli.version(version)

cli.parse()
