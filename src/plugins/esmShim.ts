import MagicString from 'magic-string'
import type { Plugin } from 'vite'

import { supportImportMetaPaths } from '../electron'

const CJSyntaxRe = /__filename|__dirname|require\(|require\.resolve\(/

const CJSShim_normal = `
// -- CommonJS Shims --
import __shims_url__ from 'node:url';
import __shims_path__ from 'node:path';
import __shims_module__ from 'node:module';
const __filename = __shims_url__.fileURLToPath(import.meta.url);
const __dirname = __shims_path__.dirname(__filename);
const require = __shims_module__.createRequire(import.meta.url);
`

const CJSShim_node_20_11 = `
// -- CommonJS Shims --
import __shims_module__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __shims_module__.createRequire(import.meta.url);
`

export default function esmShimPlugin(): Plugin {
  const CJSShim = supportImportMetaPaths() ? CJSShim_node_20_11 : CJSShim_normal

  return {
    name: 'vite:esm-shim',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, _chunk, { format, sourcemap }) {
      if (format === 'es') {
        // Rolldown may remove unused shim bindings after this hook; referenced bindings remain available.
        if (code.includes(CJSShim) || !CJSyntaxRe.test(code)) {
          return null
        }

        const lastESMImport = this.parse(code)
          .body.filter(node => node.type === 'ImportDeclaration')
          .pop()
        const indexToAppend = lastESMImport ? lastESMImport.end : 0
        const s = new MagicString(code)
        s.appendRight(indexToAppend, CJSShim)
        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null
        }
      }

      return null
    }
  }
}
