import path from 'node:path'
import fs from 'node:fs/promises'
import type { SourceMapInput } from 'rollup'
import { type Plugin, normalizePath } from 'vite'
import MagicString from 'magic-string'
import { cleanUrl, getHash, toRelativePath } from '../utils'
import { supportImportMetaPaths } from '../electron'

const nodeAssetRE = /__VITE_NODE_ASSET__([\w$]+)__/g
const nodePublicAssetRE = /__VITE_NODE_PUBLIC_ASSET__([a-z\d]{8})__/g

const assetImportRE = /(?:[?|&]asset(?:&|$)|\.wasm\?loader$|\.node$)/
const assetRE = /[?|&]asset(?:&|$)/
const assetUnpackRE = /[?|&]asset&asarUnpack$/

const wasmHelperId = '\0__electron-vite-wasm-helper'

const wasmHelperCode = `
import { join } from 'path'
import { readFile } from 'fs/promises'

export default async function loadWasm(file, importObject = {}) {
  const wasmBuffer = await readFile(join(__dirname, file))
  const result = await WebAssembly.instantiate(wasmBuffer, importObject)
  return result.instance
}
`

export default function assetPlugin(): Plugin {
  let publicDir = ''
  const publicAssetPathCache = new Map<string, string>()
  const assetCache = new Map<string, string>()
  const isImportMetaPathSupported = supportImportMetaPaths()
  return {
    name: 'vite:node-asset',
    apply: 'build',
    enforce: 'pre',
    buildStart(): void {
      publicAssetPathCache.clear()
      assetCache.clear()
    },
    configResolved(config): void {
      publicDir = config.publicDir
    },
    resolveId(id): string | void {
      if (id === wasmHelperId) {
        return id
      }
    },
    async load(id): Promise<string | void> {
      if (id === wasmHelperId) {
        return wasmHelperCode
      }

      if (id.startsWith('\0') || !assetImportRE.test(id)) {
        return
      }

      let referenceId: string
      const file = cleanUrl(id)
      if (publicDir && file.startsWith(publicDir)) {
        const hash = getHash(file)
        if (!publicAssetPathCache.get(hash)) {
          publicAssetPathCache.set(hash, file)
        }
        referenceId = `__VITE_NODE_PUBLIC_ASSET__${hash}__`
      } else {
        const cached = assetCache.get(file)
        if (cached) {
          referenceId = cached
        } else {
          const source = await fs.readFile(file)
          const hash = this.emitFile({
            type: 'asset',
            name: path.basename(file),
            source: source as unknown as Uint8Array
          })
          referenceId = `__VITE_NODE_ASSET__${hash}__`
          assetCache.set(file, referenceId)
        }
      }

      if (assetRE.test(id)) {
        const dirnameExpr = isImportMetaPathSupported ? 'import.meta.dirname' : '__dirname'
        if (assetUnpackRE.test(id)) {
          return `
          import { join } from 'path'
          export default join(${dirnameExpr}, ${referenceId}).replace('app.asar', 'app.asar.unpacked')`
        } else {
          return `
          import { join } from 'path'
          export default join(${dirnameExpr}, ${referenceId})`
        }
      }

      if (id.endsWith('.node')) {
        return `export default require(${referenceId})`
      }

      if (id.endsWith('.wasm?loader')) {
        return `
        import loadWasm from ${JSON.stringify(wasmHelperId)}
        export default importObject => loadWasm(${referenceId}, importObject)`
      }
    },
    renderChunk(code, chunk, { sourcemap, dir }): { code: string; map: SourceMapInput } | null {
      let match: RegExpExecArray | null
      let s: MagicString | undefined

      nodeAssetRE.lastIndex = 0
      while ((match = nodeAssetRE.exec(code))) {
        s ||= new MagicString(code)
        const [full, hash] = match
        const filename = this.getFileName(hash)
        const outputFilepath = toRelativePath(filename, chunk.fileName)
        const replacement = JSON.stringify(outputFilepath)
        s.overwrite(match.index, match.index + full.length, replacement, {
          contentOnly: true
        })
      }

      nodePublicAssetRE.lastIndex = 0
      while ((match = nodePublicAssetRE.exec(code))) {
        s ||= new MagicString(code)
        const [full, hash] = match
        const filename = publicAssetPathCache.get(hash)!
        const outputFilepath = toRelativePath(filename, normalizePath(path.join(dir!, chunk.fileName)))
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
