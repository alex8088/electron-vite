import type { Plugin } from 'vite'
import type { SourceMapInput } from 'rollup'
import MagicString from 'magic-string'
import { cleanUrl, parseRequest, toRelativePath } from '../utils'

const modulePathRE = /__VITE_MODULE_PATH__([\w$]+)__/g

/**
 * Resolve `?modulePath` import and return the module bundle path.
 */
export default function modulePathPlugin(): Plugin {
  let sourcemap: boolean | 'inline' | 'hidden' = false
  return {
    name: 'vite:module-path',
    apply: 'build',
    enforce: 'pre',
    configResolved(config): void {
      sourcemap = config.build.sourcemap
    },
    resolveId(id, importer): string | void {
      const query = parseRequest(id)
      if (query && typeof query.modulePath === 'string') {
        return id + `&importer=${importer}`
      }
    },
    load(id): string | void {
      const query = parseRequest(id)
      if (query && typeof query.modulePath === 'string' && typeof query.importer === 'string') {
        const cleanPath = cleanUrl(id)
        const hash = this.emitFile({
          type: 'chunk',
          id: cleanPath,
          importer: query.importer
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
