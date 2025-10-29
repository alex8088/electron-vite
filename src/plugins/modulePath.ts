import path from 'node:path'
import { type Plugin, type InlineConfig, build as viteBuild, mergeConfig } from 'vite'
import type { SourceMapInput, RollupOutput, OutputOptions } from 'rollup'
import MagicString from 'magic-string'
import buildReporterPlugin from './buildReporter'
import { cleanUrl, toRelativePath } from '../utils'
import { supportImportMetaPaths } from '../electron'

const modulePathRE = /__VITE_MODULE_PATH__([\w$]+)__/g

/**
 * Resolve `?modulePath` import and return the module bundle path.
 */
export default function modulePathPlugin(config: InlineConfig): Plugin {
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
        const re = await bundleEntryFile(cleanUrl(id), config, this.meta.watchMode)
        const [outputChunk, ...outputChunks] = re.bundles.output
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
        for (const id of re.watchFiles) {
          this.addWatchFile(id)
        }
        const refId = `__VITE_MODULE_PATH__${hash}__`
        const dirnameExpr = isImportMetaPathSupported ? 'import.meta.dirname' : '__dirname'
        return `
          import { join } from 'path'
          export default join(${dirnameExpr}, ${refId})`
      }
    },
    renderChunk(code, chunk, { sourcemap }): { code: string; map: SourceMapInput } | null {
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

async function bundleEntryFile(
  input: string,
  config: InlineConfig,
  watch: boolean
): Promise<{ bundles: RollupOutput; watchFiles: string[] }> {
  const reporter = watch ? buildReporterPlugin() : undefined
  const viteConfig = mergeConfig(config, {
    build: {
      rollupOptions: { input },
      write: false,
      watch: false
    },
    plugins: [
      {
        name: 'vite:entry-file-name',
        outputOptions(output): OutputOptions {
          if (typeof output.entryFileNames !== 'function' && output.entryFileNames) {
            output.entryFileNames = '[name]-[hash]' + path.extname(output.entryFileNames)
          }
          return output
        }
      },
      reporter
    ],
    logLevel: 'warn',
    configFile: false
  })
  const bundles = await viteBuild(viteConfig)

  return {
    bundles: bundles as RollupOutput,
    watchFiles: reporter?.api?.getWatchFiles() || []
  }
}
