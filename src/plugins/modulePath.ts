import path from 'node:path'
import { type Plugin, type InlineConfig, build as viteBuild, mergeConfig } from 'vite'
import type { SourceMapInput, RollupOutput, OutputOptions } from 'rollup'
import MagicString from 'magic-string'
import { cleanUrl, toRelativePath } from '../utils'

const modulePathRE = /__VITE_MODULE_PATH__([\w$]+)__/g

/**
 * Resolve `?modulePath` import and return the module bundle path.
 */
export default function modulePathPlugin(config: InlineConfig): Plugin {
  let sourcemap: boolean | 'inline' | 'hidden' = false
  return {
    name: 'vite:module-path',
    apply: 'build',
    enforce: 'pre',
    configResolved(config): void {
      sourcemap = config.build.sourcemap
    },
    async load(id): Promise<string | void> {
      if (id.endsWith('?modulePath')) {
        // id resolved by Vite resolve plugin
        const bundle = await bundleEntryFile(cleanUrl(id), config)
        const [outputChunk, ...outputChunks] = bundle.output
        const hash = this.emitFile({
          type: 'asset',
          fileName: outputChunk.fileName,
          source: outputChunk.code
        })
        outputChunks.forEach(chunk => {
          this.emitFile({
            type: 'asset',
            fileName: chunk.fileName,
            source: chunk.type === 'chunk' ? chunk.code : chunk.source
          })
        })
        const refId = `__VITE_MODULE_PATH__${hash}__`
        return `
          import { join } from 'path'
          export default join(__dirname, ${refId})`
      }
    },
    renderChunk(code, chunk): { code: string; map: SourceMapInput } | null {
      if (code.match(modulePathRE)) {
        let match: RegExpExecArray | null
        const s = new MagicString(code)

        while ((match = modulePathRE.exec(code))) {
          const [full, hash] = match
          const filename = this.getFileName(hash)
          const outputFilepath = toRelativePath(filename, chunk.fileName)
          const replacement = JSON.stringify(outputFilepath)
          s.overwrite(match.index, match.index + full.length, replacement, {
            contentOnly: true
          })
        }

        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null
        }
      }

      return null
    }
  }
}

async function bundleEntryFile(input: string, config: InlineConfig): Promise<RollupOutput> {
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
      }
    ],
    logLevel: 'warn',
    configFile: false
  })
  const bundles = await viteBuild(viteConfig)
  return bundles as RollupOutput
}
