import type { ChildProcess } from 'node:child_process'
import {
  type UserConfig as ViteConfig,
  type ViteDevServer,
  createServer as viteCreateServer,
  build as viteBuild,
  createLogger,
  mergeConfig
} from 'vite'
import colors from 'picocolors'
import { type InlineConfig, resolveConfig } from './config'
import { resolveHostname } from './utils'
import { startElectron } from './electron'

type ElectronViteDevServer = {
  getElectronProcess: () => ChildProcess | undefined
  getViteServer: () => ViteDevServer | undefined
}

export async function createServer(
  inlineConfig: InlineConfig = {},
  options: { rendererOnly?: boolean } = {}
): Promise<ElectronViteDevServer> {
  process.env.NODE_ENV_ELECTRON_VITE = 'development'
  const config = await resolveConfig(inlineConfig, 'serve', 'development')
  let server: ViteDevServer | undefined
  let ps: ChildProcess | undefined

  if (config.config) {
    const logger = createLogger(inlineConfig.logLevel)

    const errorHook = (e): void => {
      logger.error(`${colors.bgRed(colors.white(' ERROR '))} ${colors.red(e.message)}`)
    }

    const mainViteConfig = config.config?.main
    if (mainViteConfig && !options.rendererOnly) {
      const watchHook = (): void => {
        logger.info(colors.green(`\nelectron main process rebuilt successfully`))

        if (ps) {
          ps.removeAllListeners()
          ps.kill()
          ps = startElectron(inlineConfig.root)

          logger.info(colors.green(`\nrestarting electron app...\n`))
        }
      }

      await doBuild(mainViteConfig, watchHook, errorHook)

      logger.info(colors.green(`\nelectron main process built successfully`))
    }

    const preloadViteConfig = config.config?.preload
    if (preloadViteConfig && !options.rendererOnly) {
      logger.info(colors.gray(`\n-----\n`))

      const watchHook = (): void => {
        logger.info(colors.green(`\nelectron preload scripts rebuilt successfully`))

        if (server) {
          logger.info(colors.cyan(`\nreloading electron renderer...\n`))

          server.ws.send({ type: 'full-reload' })
        }
      }

      await doBuild(preloadViteConfig, watchHook, errorHook)

      logger.info(colors.green(`\nelectron preload scripts built successfully`))
    }

    if (options.rendererOnly) {
      logger.warn(
        `\n${colors.yellow(colors.bold('(!)'))} ${colors.yellow('skipped building main process and preload scripts (using previous build)')}`
      )
    }

    const rendererViteConfig = config.config?.renderer
    if (rendererViteConfig) {
      logger.info(colors.gray(`\n-----\n`))

      server = await viteCreateServer(rendererViteConfig)

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
        clear: !slogger.hasWarned && !options.rendererOnly
      })

      server.printUrls()
    }

    ps = startElectron(inlineConfig.root)

    logger.info(colors.green(`\nstarting electron app...\n`))
  }

  return {
    getElectronProcess: () => ps,
    getViteServer: () => server
  }
}

type UserConfig = ViteConfig & { configFile?: string | false }

async function doBuild(config: UserConfig, watchHook: () => void, errorHook: (e: Error) => void): Promise<void> {
  return new Promise(resolve => {
    if (config.build?.watch) {
      let firstBundle = true
      const closeBundle = (): void => {
        if (firstBundle) {
          firstBundle = false
          resolve()
        } else {
          watchHook()
        }
      }

      config = mergeConfig(config, {
        plugins: [
          {
            name: 'vite:electron-watcher',
            closeBundle
          }
        ]
      })
    }

    viteBuild(config)
      .then(() => {
        if (!config.build?.watch) {
          resolve()
        }
      })
      .catch(e => errorHook(e))
  })
}
