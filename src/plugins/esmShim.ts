/*
 * The core of this plugin was conceived by pi0 and is taken from the following repository:
 * https://github.com/unjs/unbuild/blob/main/src/builder/plugins/cjs.ts
 * license: https://github.com/unjs/unbuild/blob/main/LICENSE
 */

import MagicString from 'magic-string'
import type { SourceMapInput } from 'rollup'
import type { ESTree, Plugin } from 'vite'

import { supportImportMetaPaths } from '../electron'

const CJSShimMarker = '// -- CommonJS Shims --'
const CJSFilenameRe = /__filename/
const CJSDirnameRe = /__dirname/
const CJSRequireRe = /require\(|require\.resolve\(/

const ESMStaticImportRe =
  /(?<=\s|^|;)import\s*([\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^\s"](?=\s*")|(?<='\s*)[^']*[^\s'](?=\s*'))\s*["'][\s;]*/gmu

interface StaticImport {
  end: number
}

function findStaticImports(code: string): StaticImport[] {
  const matches: StaticImport[] = []
  for (const match of code.matchAll(ESMStaticImportRe)) {
    matches.push({ end: (match.index || 0) + match[0].length })
  }
  return matches
}

function addBindingIdentifiers(pattern: ESTree.BindingPattern, bindings: Set<string>): void {
  if (pattern.type === 'Identifier') {
    bindings.add(pattern.name)
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      addBindingIdentifiers(property.type === 'RestElement' ? property.argument : property.value, bindings)
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      if (element) addBindingIdentifiers(element.type === 'RestElement' ? element.argument : element, bindings)
    }
  } else {
    addBindingIdentifiers(pattern.left, bindings)
  }
}

function getUniqueBindingName(base: string, bindings: Set<string>): string {
  let name = base
  let index = 1
  while (bindings.has(name)) name = `${base}${index++}`
  bindings.add(name)
  return name
}

function createCJSShim(code: string, bindings: Set<string>): string | null {
  const needsFilename = !bindings.has('__filename') && CJSFilenameRe.test(code)
  const needsDirname = !bindings.has('__dirname') && CJSDirnameRe.test(code)
  const needsRequire = !bindings.has('require') && CJSRequireRe.test(code)

  if (!needsFilename && !needsDirname && !needsRequire) {
    return null
  }

  const imports: string[] = []
  const declarations: string[] = []

  if (supportImportMetaPaths()) {
    if (needsFilename) declarations.push('const __filename = import.meta.filename;')
    if (needsDirname) declarations.push('const __dirname = import.meta.dirname;')
  } else if (needsFilename || needsDirname) {
    const urlBinding = getUniqueBindingName('__cjs_url__', bindings)
    imports.push(`import ${urlBinding} from 'node:url';`)
    if (needsFilename) declarations.push(`const __filename = ${urlBinding}.fileURLToPath(import.meta.url);`)
    if (needsDirname) {
      const pathBinding = getUniqueBindingName('__cjs_path__', bindings)
      imports.push(`import ${pathBinding} from 'node:path';`)
      declarations.push(`const __dirname = ${pathBinding}.dirname(${urlBinding}.fileURLToPath(import.meta.url));`)
    }
  }

  if (needsRequire) {
    const moduleBinding = getUniqueBindingName('__cjs_mod__', bindings)
    imports.push(`import ${moduleBinding} from 'node:module';`)
    declarations.push(`const require = ${moduleBinding}.createRequire(import.meta.url);`)
  }

  return `\n${CJSShimMarker}\n${imports.join('\n')}\n${declarations.join('\n')}\n`
}

export default function esmShimPlugin(): Plugin {
  return {
    name: 'vite:esm-shim',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, _chunk, { format, sourcemap }): { code: string; map?: SourceMapInput } | null {
      if (format === 'es') {
        const bindings = new Set<string>()
        for (const node of this.parse(code).body) {
          if (node.type === 'ImportDeclaration') {
            for (const specifier of node.specifiers) {
              bindings.add(specifier.local.name)
            }
            continue
          }

          const declaration =
            node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' ? node.declaration : node
          if (declaration?.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              addBindingIdentifiers(declarator.id, bindings)
            }
          } else if (
            (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') &&
            declaration.id
          ) {
            bindings.add(declaration.id.name)
          }
        }

        const CJSShim = createCJSShim(code, bindings)
        if (!CJSShim) return null

        const lastESMImport = findStaticImports(code).pop()
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
