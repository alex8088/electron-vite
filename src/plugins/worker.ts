import type { Plugin } from 'vite'
import type { SourceMapInput } from 'rollup'
import MagicString from 'magic-string'
import { cleanUrl, toRelativePath } from '../utils'

const nodeWorkerAssetUrlRE = /__VITE_NODE_WORKER_ASSET__([\w$]+)__/g
const nodeWorkerRE = /\?nodeWorker(?:&|$)/
const nodeWorkerImporterRE = /(?:\?)nodeWorker&importer=([^&]+)(?:&|$)/

/**
 * Resolve `?nodeWorker` import and automatically generate `Worker` wrapper.
 */
export default function workerPlugin(): Plugin {
  return {
    name: 'vite:node-worker',
    apply: 'build',
    enforce: 'pre',
    resolveId(id, importer): string | void {
      if (id.endsWith('?nodeWorker')) {
        return id + `&importer=${importer}`
      }
    },
    load(id): string | void {
      if (nodeWorkerRE.test(id)) {
        const match = nodeWorkerImporterRE.exec(id)
        if (match) {
          const hash = this.emitFile({
            type: 'chunk',
            id: cleanUrl(id),
            importer: match[1]
          })
          const assetRefId = `__VITE_NODE_WORKER_ASSET__${hash}__`
          return `
          import { Worker } from 'node:worker_threads';
          export default function (options) { return new Worker(new URL(${assetRefId}, import.meta.url), options); }`
        }
      }
    },
    renderChunk(code, chunk, { sourcemap }): { code: string; map: SourceMapInput } | null {
      if (code.match(nodeWorkerAssetUrlRE)) {
        let match: RegExpExecArray | null
        const s = new MagicString(code)

        while ((match = nodeWorkerAssetUrlRE.exec(code))) {
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
