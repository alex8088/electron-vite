import path from 'node:path'
import fs from 'node:fs/promises'
import type { SourceMapInput } from 'rollup'
import { type Plugin, normalizePath } from 'vite'
import MagicString from 'magic-string'
import { cleanUrl, parseRequest, getHash, toRelativePath } from '../utils'

interface AssetResolved {
  type: 'asset' | 'native' | 'wasm'
  file: string
  query: Record<string, string> | null
}

function resolveAsset(id: string): AssetResolved | null {
  const file = cleanUrl(id)
  const query = parseRequest(id)

  if (query && typeof query.asset === 'string') {
    return {
      type: 'asset',
      file,
      query
    }
  }

  if (file.endsWith('.node')) {
    return {
      type: 'native',
      file,
      query
    }
  }

  if (id.endsWith('.wasm?loader')) {
    return {
      type: 'wasm',
      file,
      query
    }
  }

  return null
}

const nodeAssetRE = /__VITE_NODE_ASSET__([\w$]+)__/g
const nodePublicAssetRE = /__VITE_NODE_PUBLIC_ASSET__([a-z\d]{8})__/g

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
  let sourcemap: boolean | 'inline' | 'hidden' = false
  let publicDir = ''
  let outDir = ''
  const publicAssetPathCache = new Map<string, string>()
  const assetCache = new Map<string, string>()
  return {
    name: 'vite:node-asset',
    apply: 'build',
    enforce: 'pre',
    buildStart(): void {
      publicAssetPathCache.clear()
      assetCache.clear()
    },
    configResolved(config): void {
      sourcemap = config.build.sourcemap
      publicDir = normalizePath(config.publicDir)
      outDir = normalizePath(path.resolve(config.root, config.build.outDir))
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

      const assetResolved = resolveAsset(id)
      if (!assetResolved) {
        return
      }

      let referenceId: string
      const file = assetResolved.file
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
            source
          })
          referenceId = `__VITE_NODE_ASSET__${hash}__`
          assetCache.set(file, referenceId)
        }
      }

      if (assetResolved.type === 'asset') {
        if (assetResolved.query && typeof assetResolved.query.asarUnpack === 'string') {
          return `
          import { join } from 'path'
          export default join(__dirname, ${referenceId}).replace('app.asar', 'app.asar.unpacked')`
        } else {
          return `
          import { join } from 'path'
          export default join(__dirname, ${referenceId})`
        }
      }

      if (assetResolved.type === 'native') {
        return `export default require(${referenceId})`
      }

      if (assetResolved.type === 'wasm') {
        return `
        import loadWasm from ${JSON.stringify(wasmHelperId)}
        export default importObject => loadWasm(${referenceId}, importObject)`
      }
    },
    renderChunk(code, chunk): { code: string; map: SourceMapInput } | null {
      let match: RegExpExecArray | null
      let s: MagicString | undefined

      nodeAssetRE.lastIndex = 0
      if (code.match(nodeAssetRE)) {
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
      }

      nodePublicAssetRE.lastIndex = 0
      if (code.match(nodePublicAssetRE)) {
        while ((match = nodePublicAssetRE.exec(code))) {
          s ||= new MagicString(code)
          const [full, hash] = match
          const filename = publicAssetPathCache.get(hash)!
          const outputFilepath = toRelativePath(filename, normalizePath(path.join(outDir, chunk.fileName)))
          const replacement = JSON.stringify(outputFilepath)
          s.overwrite(match.index, match.index + full.length, replacement, {
            contentOnly: true
          })
        }
      }

      if (s) {
        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null
        }
      } else {
        return null
      }
    }
  }
}
