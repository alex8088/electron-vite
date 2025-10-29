import { type InlineConfig, type Plugin, type Logger, build as viteBuild, mergeConfig } from 'vite'
import type { InputOptions, RollupOutput } from 'rollup'
import colors from 'picocolors'

const VIRTUAL_ENTRY_ID = '\0virtual:isolate-entries'

export default function isolateEntriesPlugin(userConfig: InlineConfig): Plugin {
  let logger: Logger

  let entries: string[] | Record<string, string>
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
          entries = input
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
        const _entries = Array.isArray(entries)
          ? entries
          : Object.entries(entries).map(([key, value]) => ({ [key]: value }))
        const watchFiles = new Set<string>()
        for (const entry of _entries) {
          const re = await bundleEntryFile(entry, userConfig, this.meta.watchMode)
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
      clearLine()
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
  watch: boolean
): Promise<{ bundles: RollupOutput; watchFiles: string[]; transformedCount: number }> {
  const moduleIds: string[] = []
  let transformedCount = 0

  const viteConfig = mergeConfig(config, {
    build: {
      write: false,
      watch: false
    },
    plugins: [
      {
        name: 'vite:transform-counter',
        transform(): void {
          transformedCount++
        }
      } as Plugin,
      ...(watch
        ? [
            {
              name: 'vite:get-watch-files',
              buildEnd(): void {
                const allModuleIds = Array.from(this.getModuleIds())

                const sourceFiles = allModuleIds.filter(id => {
                  const info = this.getModuleInfo(id)
                  return info && !info.isExternal
                })

                moduleIds.push(...sourceFiles)
              }
            } as Plugin
          ]
        : [])
    ],
    logLevel: 'warn',
    configFile: false
  }) as InlineConfig

  // rewrite the input instead of merging
  viteConfig.build!.rollupOptions!.input = input

  const bundles = await viteBuild(viteConfig)

  return {
    bundles: bundles as RollupOutput,
    watchFiles: moduleIds,
    transformedCount
  }
}

function clearLine(): void {
  process.stdout.moveCursor(0, -1)
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
}
