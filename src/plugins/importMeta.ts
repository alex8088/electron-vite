import MagicString from 'magic-string'
import type { SourceMapInput } from 'rollup'
import type { Plugin } from 'vite'

const importMetaUrlRE = /\bimport\.meta\.url\b/g
const importMetaFilenameRE = /\bimport\.meta\.filename\b/g
const importMetaDirnameRE = /\bimport\.meta\.dirname\b/g

export default function importMetaPlugin(): Plugin {
  return {
    name: 'vite:import-meta',
    apply: 'build',
    enforce: 'pre',
    // For Vite 5-7 (Rollup) - this hook is removed in Vite 8
    resolveImportMeta(property, { format }): string | null {
      if (property === 'url' && format === 'cjs') {
        return `require("url").pathToFileURL(__filename).href`
      }
      if (property === 'filename' && format === 'cjs') {
        return `__filename`
      }
      if (property === 'dirname' && format === 'cjs') {
        return `__dirname`
      }
      return null
    },
    // Fallback for Vite 8+ (Rolldown) where resolveImportMeta is removed
    renderChunk(code, _chunk, { format, sourcemap }): { code: string; map?: SourceMapInput } | null {
      if (format !== 'cjs') return null
      if (!code.includes('import.meta.')) return null

      const s = new MagicString(code)
      let hasReplacements = false

      for (const match of code.matchAll(importMetaUrlRE)) {
        s.overwrite(match.index, match.index + match[0].length, 'require("url").pathToFileURL(__filename).href')
        hasReplacements = true
      }
      for (const match of code.matchAll(importMetaFilenameRE)) {
        s.overwrite(match.index, match.index + match[0].length, '__filename')
        hasReplacements = true
      }
      for (const match of code.matchAll(importMetaDirnameRE)) {
        s.overwrite(match.index, match.index + match[0].length, '__dirname')
        hasReplacements = true
      }

      if (!hasReplacements) return null

      return {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null
      }
    }
  }
}
