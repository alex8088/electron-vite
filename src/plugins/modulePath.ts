import { type Plugin, type InlineConfig, type Rolldown, build as viteBuild, mergeConfig } from 'vite'
import MagicString from 'magic-string'
import { cleanUrl, toRelativePath } from '../utils'
import { supportImportMetaPaths } from '../electron'
import type { ConfigFactory, MainViteConfig } from '../config'

const modulePathRE = /__VITE_MODULE_PATH__([\w$]+)__/g

/**
 * Resolve `?modulePath` import and return the module bundle path.
 */
export default function modulePathPlugin(factory: ConfigFactory<MainViteConfig>): Plugin {
  const isImportMetaPathSupported = supportImportMetaPaths()
  const assetCache = new Set<string>()
  return {
    name: 'vite:module-path',
    apply: 'build',
    enforce: 'pre',
    buildStart(): void {
      assetCache.clear()
    },
    async load(id): Promise<string | void> {
      if (id.endsWith('?modulePath')) {
        // id resolved by Vite resolve plugin
        const config = await factory.build(true)
        const bundles = await bundleEntryFile(cleanUrl(id), config)
        const [outputChunk, ...outputChunks] = bundles.output
        const hash = this.emitFile({
          type: 'asset',
          fileName: outputChunk.fileName,
          source: outputChunk.code
        })
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
        if (this.meta.watchMode) {
          const moduleIds = new Set<string>()
          for (const chunk of bundles.output) {
            if (chunk.type === 'chunk') {
              for (const id of chunk.moduleIds) {
                if (!id.startsWith('\0')) {
                  moduleIds.add(cleanUrl(id))
                }
              }
            }
          }
          for (const id of moduleIds) {
            this.addWatchFile(id)
          }
        }
        const refId = `__VITE_MODULE_PATH__${hash}__`
        const dirnameExpr = isImportMetaPathSupported ? 'import.meta.dirname' : '__dirname'
        return `
          import { join } from 'path'
          export default join(${dirnameExpr}, ${refId})`
      }
    },
    renderChunk(code, chunk, { sourcemap }): { code: string; map: Rolldown.SourceMapInput } | null {
      let match: RegExpExecArray | null
      let s: MagicString | undefined

      modulePathRE.lastIndex = 0
      while ((match = modulePathRE.exec(code))) {
        s ||= new MagicString(code)
        const [full, hash] = match
        const filename = this.getFileName(hash)
        const outputFilepath = toRelativePath(filename, chunk.fileName)
        const replacement = JSON.stringify(outputFilepath)
        s.overwrite(match.index, match.index + full.length, replacement, {
          contentOnly: true
        })
      }

      if (s) {
        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null
        }
      }

      return null
    }
  }
}

async function bundleEntryFile(input: string, config: InlineConfig): Promise<Rolldown.RolldownOutput> {
  const viteConfig = mergeConfig(config, {
    build: {
      write: false,
      watch: false
    },
    plugins: [
      {
        name: 'vite:entry-file-name',
        outputOptions(output): Rolldown.OutputOptions {
          // Prevent output conflicts
          output.hashCharacters = 'hex'
          // Assign chunkFileNames to entryFileNames to treat sub-entries as internal chunks
          output.entryFileNames = output.chunkFileNames
          return output
        }
      }
    ] as Plugin[],
    logLevel: 'warn',
    configFile: false
  }) as InlineConfig

  // rewrite the input instead of merging
  const buildOptions = viteConfig.build!
  buildOptions.rollupOptions = {
    ...buildOptions.rollupOptions,
    input
  }

  const bundles = await viteBuild(viteConfig)

  return bundles as Rolldown.RolldownOutput
}
