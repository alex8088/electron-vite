import type { Plugin } from 'vite'

export default function importMetaUrlPlugin(): Plugin {
  return {
    name: 'vite:import-meta-url',
    apply: 'build',
    enforce: 'pre',
    resolveImportMeta(property, { format }): string | null {
      if (property === 'url' && format === 'cjs') {
        return `require("url").pathToFileURL(__filename).href`
      }
      return null
    }
  }
}
