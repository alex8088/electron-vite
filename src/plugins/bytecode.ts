import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import colors from 'picocolors'
import { type Plugin, type LibraryOptions, type Rolldown, normalizePath } from 'vite'
import * as babel from '@babel/core'
import MagicString from 'magic-string'
import { getElectronPath } from '../electron'
import { toRelativePath } from '../utils'
import { ElectronCompiler } from './electronCompiler'

// Inspired by https://github.com/bytenode/bytenode

const _require = createRequire(import.meta.url)

function getBytecodeCompilerPath(): string {
  return path.join(path.dirname(_require.resolve('electron-vite/package.json')), 'bin', 'electron-bytecode-main.cjs')
}

// Versioned envelope: magic/version (8), UTF-16 source length (4), module ID (16), V8 cache.
// Keep our metadata separate from the private V8 cache header.
async function compileToBytecode(compiler: ElectronCompiler, code: string): Promise<Buffer> {
  const id = randomBytes(16)
  // Reserve enough source space for an untruncated, per-artifact placeholder identity.
  const source = code + '\n/*' + id.toString('hex') + '*/'
  const result = await compiler.compile(source)
  const header = Buffer.alloc(28)
  header.write('EVBC0001', 0, 'ascii')
  header.writeUInt32LE(result.sourceLength, 8)
  id.copy(header, 12)
  return Buffer.concat([header, Buffer.from(result.cachedData, 'base64')])
}

const bytecodeModuleLoaderCode = [
  '"use strict";',
  'const fs = require("node:fs");',
  'const path = require("node:path");',
  'const vm = require("node:vm");',
  'const v8 = require("node:v8");',
  'const Module = require("node:module");',
  'v8.setFlagsFromString("--no-lazy");',
  'v8.setFlagsFromString("--no-flush-bytecode");',
  'const params = ["exports", "require", "module", "__filename", "__dirname"];',
  'Module._extensions[".jsc"] = Module._extensions[".cjsc"] = function (module, filename) {',
  '  const data = fs.readFileSync(filename);',
  '  if (data.length <= 28 || data.toString("ascii", 0, 8) !== "EVBC0001") {',
  '    throw new Error("Invalid electron-vite bytecode format; rebuild the application: " + filename);',
  '  }',
  '  const length = data.readUInt32LE(8);',
  '  const tag = "/*" + data.subarray(12, 28).toString("hex") + "*/";',
  '  if (length < tag.length || length > 0x1fffffff) {',
  '    throw new Error("Invalid bytecode source length: " + filename);',
  '  }',
  '  const placeholder = tag + " ".repeat(length - tag.length);',
  '  const compiledWrapper = vm.compileFunction(placeholder, params, {',
  '    filename,',
  '    cachedData: data.subarray(28)',
  '  });',
  '  if (compiledWrapper.cachedDataRejected) {',
  '    throw new Error("Invalid or incompatible cached data (cachedDataRejected): " + filename);',
  '  }',
  '  const require = function (id) { return module.require(id); };',
  '  require.resolve = function (request, options) {',
  '    return Module._resolveFilename(request, module, false, options);',
  '  };',
  '  if (process.mainModule) require.main = process.mainModule;',
  '  require.extensions = Module._extensions;',
  '  require.cache = Module._cache;',
  '  return compiledWrapper.call(module.exports, module.exports, require, module, filename, path.dirname(filename));',
  '};'
]

const bytecodeChunkExtensionRE = /.(jsc|cjsc)$/

export interface BytecodeOptions {
  chunkAlias?: string | string[] | RegExp
  transformArrowFunctions?: boolean
  removeBundleJS?: boolean
  protectedStrings?: string[]
}

/**
 * Compile source code to v8 bytecode.
 *
 * @deprecated use `build.bytecode` config option instead
 */
export function bytecodePlugin(options: BytecodeOptions = {}): Plugin | null {
  if (process.env.NODE_ENV_ELECTRON_VITE !== 'production') {
    return null
  }

  const { chunkAlias = [], transformArrowFunctions = true, removeBundleJS = true, protectedStrings = [] } = options
  const _chunkAlias = chunkAlias instanceof RegExp ? chunkAlias : Array.isArray(chunkAlias) ? chunkAlias : [chunkAlias]

  const isBytecodeChunk = (chunkName: string): boolean => {
    if (_chunkAlias instanceof RegExp) {
      _chunkAlias.lastIndex = 0
      return _chunkAlias.test(chunkName)
    }
    return _chunkAlias.length === 0 || _chunkAlias.some(alias => alias === chunkName)
  }

  const plugins: babel.PluginItem[] = []

  if (transformArrowFunctions) {
    plugins.push('@babel/plugin-transform-arrow-functions')
  }

  if (protectedStrings.length > 0) {
    plugins.push([protectStringsPlugin as babel.PluginTarget, { protectedStrings: new Set(protectedStrings) }])
  }

  const shouldTransformBytecodeChunk = plugins.length !== 0

  const _transform = (
    code: string,
    sourceMaps: boolean = false
  ): { code: string; map?: Rolldown.SourceMapInput } | null => {
    const re = babel.transformSync(code, { plugins, sourceMaps })
    return re ? { code: re.code || '', map: re.map as Rolldown.SourceMapInput } : null
  }

  const useStrict = '"use strict";'
  const bytecodeModuleLoader = 'bytecode-loader.cjs'

  let supported = false
  let isPreload = false

  return {
    name: 'vite:bytecode',
    apply: 'build',
    enforce: 'post',
    configResolved(config): void {
      if (supported) {
        return
      }
      isPreload = config.plugins.some(p => p.name === 'vite:electron-preload-config-preset')
      const useInRenderer = config.plugins.some(p => p.name === 'vite:electron-renderer-config-preset')
      if (useInRenderer) {
        config.logger.warn(colors.yellow('bytecodePlugin does not support renderer.'))
        return
      }
      const build = config.build
      const resolvedOutputs = resolveBuildOutputs(build.rolldownOptions.output, build.lib)
      if (resolvedOutputs) {
        const outputs = Array.isArray(resolvedOutputs) ? resolvedOutputs : [resolvedOutputs]
        const output = outputs[0]
        if (output.format === 'es') {
          config.logger.warn(
            colors.yellow(
              'bytecodePlugin does not support ES module, please remove "type": "module" ' +
                'in package.json or set build.rollupOptions.output.format (or build.rolldownOptions.output.format) to "cjs".'
            )
          )
        }
        supported = output.format === 'cjs' && !useInRenderer
      }
    },
    renderChunk(code, chunk, { sourcemap }): { code: string; map?: Rolldown.SourceMapInput } | null {
      if (supported && isBytecodeChunk(chunk.name) && shouldTransformBytecodeChunk) {
        return _transform(code, !!sourcemap)
      }
      return null
    },
    async generateBundle(_, output): Promise<void> {
      if (!supported) {
        return
      }
      const _chunks = Object.values(output)
      const chunks = _chunks.filter(
        chunk => chunk.type === 'chunk' && isBytecodeChunk(chunk.name)
      ) as Rolldown.OutputChunk[]

      if (chunks.length === 0) {
        return
      }

      const bytecodeChunks = chunks.map(chunk => chunk.fileName)
      const nonEntryChunks = chunks.filter(chunk => !chunk.isEntry).map(chunk => path.basename(chunk.fileName))

      const pattern = nonEntryChunks.map(chunk => `(${chunk})`).join('|')
      const bytecodeRE = pattern ? new RegExp(`require\\(\\S*(?=(${pattern})\\S*\\))`, 'g') : null

      const getBytecodeLoaderBlock = (chunkFileName: string): string => {
        return `require("${toRelativePath(bytecodeModuleLoader, normalizePath(chunkFileName))}");`
      }

      let bytecodeChunkCount = 0

      const bundles = Object.keys(output)

      const compiler = new ElectronCompiler({
        path: getElectronPath(),
        args: [getBytecodeCompilerPath()],
        env: { ELECTRON_VITE_RENDERER: isPreload ? '1' : '0' }
      })
      try {
        await compiler.start()
        for (const name of bundles) {
          const chunk = output[name]
          if (chunk.type === 'chunk') {
            let _code = chunk.code
            if (bytecodeRE) {
              let match: RegExpExecArray | null
              let s: MagicString | undefined
              while ((match = bytecodeRE.exec(_code))) {
                s ||= new MagicString(_code)
                const [prefix, chunkName] = match
                const len = prefix.length + chunkName.length
                s.overwrite(match.index, match.index + len, prefix + chunkName + 'c', {
                  contentOnly: true
                })
              }
              if (s) {
                _code = s.toString()
              }
            }
            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(compiler, _code)
              this.emitFile({
                type: 'asset',
                fileName: name + 'c',
                source: bytecodeBuffer
              })
              if (!removeBundleJS) {
                this.emitFile({
                  type: 'asset',
                  fileName: '_' + chunk.fileName,
                  source: chunk.code
                })
              }
              if (chunk.isEntry) {
                const bytecodeLoaderBlock = getBytecodeLoaderBlock(chunk.fileName)
                const bytecodeModuleBlock = `require("./${path.basename(name) + 'c'}");`
                const code = `${useStrict}\n${bytecodeLoaderBlock}\n${bytecodeModuleBlock}\n`
                chunk.code = code
              } else {
                delete output[chunk.fileName]
              }
              bytecodeChunkCount += 1
            } else {
              if (chunk.isEntry) {
                let hasBytecodeMoudle = false
                const idsToHandle = new Set([...chunk.imports, ...chunk.dynamicImports])
                for (const moduleId of idsToHandle) {
                  if (bytecodeChunks.includes(moduleId)) {
                    hasBytecodeMoudle = true
                    break
                  }
                  const moduleInfo = this.getModuleInfo(moduleId)
                  if (moduleInfo) {
                    const { importers, dynamicImporters } = moduleInfo
                    for (const importerId of importers) idsToHandle.add(importerId)
                    for (const importerId of dynamicImporters) idsToHandle.add(importerId)
                  }
                }
                if (hasBytecodeMoudle) {
                  const loader = getBytecodeLoaderBlock(chunk.fileName)
                  const strictRE = /^(#![^\n]*\n)?(["'])use strict\2;/
                  _code = strictRE.test(_code)
                    ? _code.replace(strictRE, `$&\n${loader}`)
                    : _code.replace(/^(#![^\n]*\n)?/, `$&${loader}\n`)
                }
              }
              chunk.code = _code
            }
          }
        }
      } finally {
        await compiler.stop()
      }

      if (bytecodeChunkCount && !_chunks.some(ass => ass.type === 'asset' && ass.fileName === bytecodeModuleLoader)) {
        this.emitFile({
          type: 'asset',
          source: bytecodeModuleLoaderCode.join('\n') + '\n',
          name: 'Bytecode Loader File',
          fileName: bytecodeModuleLoader
        })
      }
    },
    writeBundle(_, output): void {
      if (supported) {
        const bytecodeChunkCount = Object.keys(output).filter(chunk => bytecodeChunkExtensionRE.test(chunk)).length
        this.environment.logger.info(`${colors.green(`✓`)} ${bytecodeChunkCount} chunks compiled into bytecode.`)
      }
    }
  }
}

function resolveBuildOutputs(
  outputs: Rolldown.OutputOptions | Rolldown.OutputOptions[] | undefined,
  libOptions: LibraryOptions | false
): Rolldown.OutputOptions | Rolldown.OutputOptions[] | undefined {
  if (libOptions && !Array.isArray(outputs)) {
    const libFormats = libOptions.formats || []
    return libFormats.map(format => ({ ...outputs, format }))
  }
  return outputs
}

interface ProtectStringsPluginState extends babel.PluginPass {
  opts: { protectedStrings: Set<string> }
}

function protectStringsPlugin(api: typeof babel & babel.ConfigAPI): babel.PluginObj<ProtectStringsPluginState> {
  const { types: t } = api

  function createFromCharCodeFunction(value: string): babel.types.CallExpression {
    const charCodes = Array.from(value).map(s => s.charCodeAt(0))
    const charCodeLiterals = charCodes.map(code => t.numericLiteral(code))

    // String.fromCharCode
    const memberExpression = t.memberExpression(t.identifier('String'), t.identifier('fromCharCode'))
    // String.fromCharCode(...arr)
    const callExpression = t.callExpression(memberExpression, [t.spreadElement(t.identifier('arr'))])
    // return String.fromCharCode(...arr)
    const returnStatement = t.returnStatement(callExpression)
    // function (arr) { return ... }
    const functionExpression = t.functionExpression(null, [t.identifier('arr')], t.blockStatement([returnStatement]))

    // (function(...) { ... })([x, x, x])
    return t.callExpression(functionExpression, [t.arrayExpression(charCodeLiterals)])
  }

  return {
    name: 'protect-strings-plugin',
    visitor: {
      StringLiteral(path, state) {
        // obj['property']
        if (path.parentPath.isMemberExpression({ property: path.node, computed: true })) {
          return
        }

        // { 'key': value }
        if (path.parentPath.isObjectProperty({ key: path.node, computed: false })) {
          return
        }

        // require('fs')
        if (
          path.parentPath.isCallExpression() &&
          t.isIdentifier(path.parentPath.node.callee) &&
          path.parentPath.node.callee.name === 'require' &&
          path.parentPath.node.arguments[0] === path.node
        ) {
          return
        }

        // Only CommonJS is supported, import declaration and export declaration checks are ignored

        const { value } = path.node
        if (state.opts.protectedStrings.has(value)) {
          path.replaceWith(createFromCharCodeFunction(value))
        }
      },
      TemplateLiteral(path, state) {
        // Must be a pure static template literal
        // expressions must be empty (no ${variables})
        // quasis must have only one element (meaning the entire string is a single static part).
        if (path.node.expressions.length > 0 || path.node.quasis.length !== 1) {
          return
        }

        // Extract the raw value of the template literal
        // path.node.quasis[0].value.raw is used to get the raw string, including escape sequences
        // path.node.quasis[0].value.cooked is used to get the processed/cooked string (with escape sequences handled)
        const value = path.node.quasis[0].value.cooked
        if (value && state.opts.protectedStrings.has(value)) {
          path.replaceWith(createFromCharCodeFunction(value))
        }
      }
    }
  }
}
