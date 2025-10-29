/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
import path from 'node:path'
import { type InlineConfig, type Plugin, type Logger, type LogLevel, build as viteBuild, mergeConfig } from 'vite'
import type { InputOptions, RollupOutput } from 'rollup'
import colors from 'picocolors'
import buildReporterPlugin from './buildReporter'

const VIRTUAL_ENTRY_ID = '\0virtual:isolate-entries'

const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3
}

export default function isolateEntriesPlugin(userConfig: InlineConfig): Plugin {
  let logger: Logger

  let entries: string[] | { [x: string]: string }[]

  let transformedCount = 0

  const assetCache = new Set<string>()

  return {
    name: 'vite:isolate-entries',
    apply: 'build',

    configResolved(config): void {
      logger = config.logger
    },

    options(opts): InputOptions | void {
      const { input } = opts
      if (input && typeof input === 'object') {
        if ((Array.isArray(input) && input.length > 0) || Object.keys(input).length > 1) {
          opts.input = VIRTUAL_ENTRY_ID
          entries = Array.isArray(input) ? input : Object.entries(input).map(([key, value]) => ({ [key]: value }))
          return opts
        }
      }
    },

    buildStart(): void {
      transformedCount = 0
      assetCache.clear()
    },

    resolveId(id): string | null {
      if (id === VIRTUAL_ENTRY_ID) {
        return id
      }
      return null
    },

    async load(id): Promise<string | void> {
      if (id === VIRTUAL_ENTRY_ID) {
        const shouldLog = LogLevels[userConfig.logLevel || 'info'] >= LogLevels.info
        const shouldWatch = this.meta.watchMode

        const watchFiles = new Set<string>()

        for (const entry of entries) {
          const re = await bundleEntryFile(entry, userConfig, shouldWatch, shouldLog, transformedCount)

          const outputChunks = re.bundles.output
          for (const chunk of outputChunks) {
            if (assetCache.has(chunk.fileName)) {
              continue
            }
            this.emitFile({
              type: 'asset',
              fileName: chunk.fileName,
              source: chunk.type === 'chunk' ? chunk.code : chunk.source
            })
            assetCache.add(chunk.fileName)
          }

          for (const id of re.watchFiles) {
            watchFiles.add(id)
          }

          transformedCount += re.transformedCount
        }

        for (const id of watchFiles) {
          this.addWatchFile(id)
        }

        return `
        // This is the virtual entry file
        console.log(1)`
      }
    },

    renderStart(): void {
      clearLine(-1)
      logger.info(`${colors.green(`✓`)} ${transformedCount} modules transformed.`)
    },

    generateBundle(_, bundle): void {
      for (const chunkName in bundle) {
        if (chunkName.includes('virtual_isolate-entries')) {
          delete bundle[chunkName]
        }
      }
    }
  }
}

async function bundleEntryFile(
  input: string | Record<string, string>,
  config: InlineConfig,
  watch: boolean,
  shouldLog: boolean,
  preTransformedCount: number
): Promise<{ bundles: RollupOutput; watchFiles: string[]; transformedCount: number }> {
  const transformReporter = transformReporterPlugin(preTransformedCount, shouldLog)
  const buildReporter = watch ? buildReporterPlugin() : undefined

  const viteConfig = mergeConfig(config, {
    build: {
      write: false,
      watch: false
    },
    plugins: [transformReporter, buildReporter],
    logLevel: 'warn',
    configFile: false
  }) as InlineConfig

  // rewrite the input instead of merging
  viteConfig.build!.rollupOptions!.input = input

  const bundles = await viteBuild(viteConfig)

  return {
    bundles: bundles as RollupOutput,
    watchFiles: buildReporter?.api?.getWatchFiles() || [],
    transformedCount: transformReporter?.api?.getTransformedCount() || 0
  }
}

function transformReporterPlugin(
  preTransformedCount = 0,
  shouldLog = true
): Plugin<{ getTransformedCount: () => number }> {
  let transformedCount = 0
  let root
  const log = throttle(id => {
    writeLine(`transforming (${preTransformedCount + transformedCount}) ${colors.dim(path.relative(root, id))}`)
  })
  return {
    name: 'vite:transform-reporter',
    configResolved(config) {
      root = config.root
    },
    transform(_, id) {
      transformedCount++
      if (!shouldLog) return
      if (id.includes('?')) return
      log(id)
    },
    api: {
      getTransformedCount() {
        return transformedCount
      }
    }
  }
}

function writeLine(output: string): void {
  clearLine()
  if (output.length < process.stdout.columns) {
    process.stdout.write(output)
  } else {
    process.stdout.write(output.substring(0, process.stdout.columns - 1))
  }
}

function clearLine(move: number = 0): void {
  if (move < 0) {
    process.stdout.moveCursor(0, move)
  }
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
}

function throttle(fn: Function) {
  let timerHandle: NodeJS.Timeout | null = null
  return (...args: any[]) => {
    if (timerHandle) return
    fn(...args)
    timerHandle = setTimeout(() => {
      timerHandle = null
    }, 100)
  }
}
