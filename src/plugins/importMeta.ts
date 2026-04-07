/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Plugin, version } from 'vite'

/**
 * @deprecated Vite 8 (Rolldown) now provides native support for these
 * `import.meta` properties. These properties are polyfilled when the output
 * format is CJS.
 *
 * @see https://rolldown.rs/in-depth/non-esm-output-formats#well-known-import-meta-properties
 */
export default function importMetaPlugin(): Plugin | null {
  const currentVersion = version.split('.')
  const major = parseInt(currentVersion[0], 10)
  if (major >= 8) {
    return null
  }
  return {
    name: 'vite:import-meta',
    apply: 'build',
    enforce: 'pre',
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
    }
  } as any
}
