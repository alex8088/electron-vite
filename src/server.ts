import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import {
  createServer as ViteCreateServer,
  build as viteBuild,
  createLogger,
  Logger,
  ViteDevServer,
  UserConfig,
  mergeConfig
} from 'vite'
import colors from 'picocolors'
import { InlineConfig, resolveConfig } from './config'
import { ensureElectronEntryFile, getElectronPath, resolveHostname } from './utils'
import { PluginHooks } from 'rollup'

export function createElectron(root?: string, logger?: Logger): ChildProcessWithoutNullStreams {
  ensureElectronEntryFile(root)
  const electronPath = getElectronPath()
  const ps = spawn(electronPath, ['.'])

  ps.stdout.on('data', chunk => {
    chunk.toString().trim() && logger && logger.info(chunk.toString())
  })
  ps.stderr.on('data', chunk => {
    chunk.toString().trim() && logger && logger.error(chunk.toString())
  })
  ps.on('close', process.exit)

  return ps
}

export function build(config: UserConfig, closeBundle?: PluginHooks['closeBundle']): ReturnType<typeof viteBuild> {
  const watchConfig: UserConfig = {
    // Enable watch through `electron.vite.config.{ js | ts | mjs }`
    // build: { watch: {} },
    plugins: [
      {
        name: 'vite:electron-serve-build',
        closeBundle
      }
    ]
  }

  return viteBuild(mergeConfig(watchConfig, config))
}

export async function createRenderServer(config: UserConfig): Promise<ViteDevServer> {
  const server = await ViteCreateServer(config)

  if (!server.httpServer) {
    throw new Error('HTTP server not available')
  }

  await server.listen()

  const conf = server.config.server
  const protocol = conf.https ? 'https:' : 'http:'
  const host = resolveHostname(conf.host)
  const port = conf.port
  process.env.ELECTRON_RENDERER_URL = `${protocol}//${host}:${port}`

  const slogger = server.config.logger

  slogger.info(colors.green(`dev server running for the electron renderer process at:\n`), {
    clear: !slogger.hasWarned
  })

  server.printUrls()

  return server
}

export async function createServer(inlineConfig: InlineConfig = {}): Promise<void> {
  const config = await resolveConfig(inlineConfig, 'serve', 'development')
  const { main, preload, renderer } = config.config || {}
  const logger = createLogger(inlineConfig.logLevel)

  let server: ViteDevServer | undefined
  let ps: ChildProcessWithoutNullStreams | undefined

  if (main) {
    await build(main, () => {
      logger.info(colors.green(`\nbuild the electron main process successfully`))

      if (ps) {
        logger.info(colors.green(`\nwaiting for electron to exit...`))

        ps.removeAllListeners()
        ps.kill()
        ps = createElectron(inlineConfig.root, logger)

        logger.info(colors.green(`\n🚀 restart electron app...`))
      }
    })
  }

  if (preload) {
    logger.info(colors.gray(`\n-----\n`))

    await build(preload, () => {
      logger.info(colors.green(`\nbuild the electron preload files successfully`))

      if (server) {
        logger.info(colors.green(`\nwaiting for render page to reload...`))

        server.ws.send({ type: 'full-reload' })

        logger.info(colors.green(`\nreload render page successfully`))
      }
    })
  }

  if (renderer) {
    logger.info(colors.gray(`\n-----\n`))

    server = await createRenderServer(renderer)
  }

  ps = createElectron(inlineConfig.root, logger)

  logger.info(colors.green(`\n🚀 start electron app...`))
}
