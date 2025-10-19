import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import colors from 'picocolors'
import { type Plugin, type Logger, type LibraryOptions, normalizePath } from 'vite'
import * as babel from '@babel/core'
import MagicString from 'magic-string'
import type { SourceMapInput, OutputChunk, OutputOptions } from 'rollup'
import { getElectronPath } from '../electron'
import { toRelativePath } from '../utils'

// Inspired by https://github.com/bytenode/bytenode

const _require = createRequire(import.meta.url)

function getBytecodeCompilerPath(): string {
  return path.join(path.dirname(_require.resolve('electron-vite/package.json')), 'bin', 'electron-bytecode.cjs')
}

function compileToBytecode(code: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let data = Buffer.from([])

    const electronPath = getElectronPath()
    const bytecodePath = getBytecodeCompilerPath()

    const proc = spawn(electronPath, [bytecodePath], {
      env: { ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    if (proc.stdin) {
      proc.stdin.write(code)
      proc.stdin.end()
    }

    if (proc.stdout) {
      proc.stdout.on('data', chunk => {
        data = Buffer.concat([data, chunk])
      })
      proc.stdout.on('error', err => {
        console.error(err)
      })
      proc.stdout.on('end', () => {
        resolve(data)
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', chunk => {
        console.error('Error: ', chunk.toString())
      })
      proc.stderr.on('error', err => {
        console.error('Error: ', err)
      })
    }

    proc.addListener('message', message => console.log(message))
    proc.addListener('error', err => console.error(err))

    proc.on('error', err => reject(err))
    proc.on('exit', () => {
      resolve(data)
    })
  })
}

const bytecodeModuleLoaderCode = [
  `"use strict";`,
  `const fs = require("fs");`,
  `const path = require("path");`,
  `const vm = require("vm");`,
  `const v8 = require("v8");`,
  `const Module = require("module");`,
  `v8.setFlagsFromString("--no-lazy");`,
  `v8.setFlagsFromString("--no-flush-bytecode");`,
  `const FLAG_HASH_OFFSET = 12;`,
  `const SOURCE_HASH_OFFSET = 8;`,
  `let dummyBytecode;`,
  `function setFlagHashHeader(bytecodeBuffer) {`,
  `  if (!dummyBytecode) {`,
  `    const script = new vm.Script("", {`,
  `      produceCachedData: true`,
  `    });`,
  `    dummyBytecode = script.createCachedData();`,
  `  }`,
  `  dummyBytecode.slice(FLAG_HASH_OFFSET, FLAG_HASH_OFFSET + 4).copy(bytecodeBuffer, FLAG_HASH_OFFSET);`,
  `};`,
  `function getSourceHashHeader(bytecodeBuffer) {`,
  `  return bytecodeBuffer.slice(SOURCE_HASH_OFFSET, SOURCE_HASH_OFFSET + 4);`,
  `};`,
  `function buffer2Number(buffer) {`,
  `  let ret = 0;`,
  `  ret |= buffer[3] << 24;`,
  `  ret |= buffer[2] << 16;`,
  `  ret |= buffer[1] << 8;`,
  `  ret |= buffer[0];`,
  `  return ret;`,
  `};`,
  `Module._extensions[".jsc"] = Module._extensions[".cjsc"] = function (module, filename) {`,
  `  const bytecodeBuffer = fs.readFileSync(filename);`,
  `  if (!Buffer.isBuffer(bytecodeBuffer)) {`,
  `    throw new Error("BytecodeBuffer must be a buffer object.");`,
  `  }`,
  `  setFlagHashHeader(bytecodeBuffer);`,
  `  const length = buffer2Number(getSourceHashHeader(bytecodeBuffer));`,
  `  let dummyCode = "";`,
  `  if (length > 1) {`,
  `    dummyCode = "\\"" + "\\u200b".repeat(length - 2) + "\\"";`,
  `  }`,
  `  const script = new vm.Script(dummyCode, {`,
  `    filename: filename,`,
  `    lineOffset: 0,`,
  `    displayErrors: true,`,
  `    cachedData: bytecodeBuffer`,
  `  });`,
  `  if (script.cachedDataRejected) {`,
  `    throw new Error("Invalid or incompatible cached data (cachedDataRejected)");`,
  `  }`,
  `  const require = function (id) {`,
  `    return module.require(id);`,
  `  };`,
  `  require.resolve = function (request, options) {`,
  `    return Module._resolveFilename(request, module, false, options);`,
  `  };`,
  `  if (process.mainModule) {`,
  `    require.main = process.mainModule;`,
  `  }`,
  `  require.extensions = Module._extensions;`,
  `  require.cache = Module._cache;`,
  `  const compiledWrapper = script.runInThisContext({`,
  `    filename: filename,`,
  `    lineOffset: 0,`,
  `    columnOffset: 0,`,
  `    displayErrors: true`,
  `  });`,
  `  const dirname = path.dirname(filename);`,
  `  const args = [module.exports, require, module, filename, dirname, process, global];`,
  `  return compiledWrapper.apply(module.exports, args);`,
  `};`
]

const bytecodeChunkExtensionRE = /.(jsc|cjsc)$/

export interface BytecodeOptions {
  chunkAlias?: string | string[]
  transformArrowFunctions?: boolean
  removeBundleJS?: boolean
  protectedStrings?: string[]
}

/**
 * Compile to v8 bytecode to protect source code.
 */
export function bytecodePlugin(options: BytecodeOptions = {}): Plugin | null {
  if (process.env.NODE_ENV_ELECTRON_VITE !== 'production') {
    return null
  }

  const { chunkAlias = [], transformArrowFunctions = true, removeBundleJS = true, protectedStrings = [] } = options
  const _chunkAlias = Array.isArray(chunkAlias) ? chunkAlias : [chunkAlias]

  const transformAllChunks = _chunkAlias.length === 0
  const isBytecodeChunk = (chunkName: string): boolean => {
    return transformAllChunks || _chunkAlias.some(alias => alias === chunkName)
  }

  const plugins: babel.PluginItem[] = []

  if (transformArrowFunctions) {
    plugins.push('@babel/plugin-transform-arrow-functions')
  }

  if (protectedStrings.length > 0) {
    plugins.push([protectStringsPlugin, { protectedStrings: new Set(protectedStrings) }])
  }

  const shouldTransformBytecodeChunk = plugins.length !== 0

  const _transform = (code: string, sourceMaps: boolean = false): { code: string; map?: SourceMapInput } | null => {
    const re = babel.transform(code, { plugins, sourceMaps })
    return re ? { code: re.code || '', map: re.map } : null
  }

  const useStrict = '"use strict";'
  const bytecodeModuleLoader = 'bytecode-loader.cjs'

  let logger: Logger
  let supported = false

  return {
    name: 'vite:bytecode',
    apply: 'build',
    enforce: 'post',
    configResolved(config): void {
      if (supported) {
        return
      }
      logger = config.logger
      const useInRenderer = config.plugins.some(p => p.name === 'vite:electron-renderer-preset-config')
      if (useInRenderer) {
        config.logger.warn(colors.yellow('bytecodePlugin does not support renderer.'))
        return
      }
      const build = config.build
      const resolvedOutputs = resolveBuildOutputs(build.rollupOptions.output, build.lib)
      if (resolvedOutputs) {
        const outputs = Array.isArray(resolvedOutputs) ? resolvedOutputs : [resolvedOutputs]
        const output = outputs[0]
        if (output.format === 'es') {
          config.logger.warn(
            colors.yellow(
              'bytecodePlugin does not support ES module, please remove "type": "module" ' +
                'in package.json or set the "build.rollupOptions.output.format" option to "cjs".'
            )
          )
        }
        supported = output.format === 'cjs' && !useInRenderer
      }
      if (supported && config.build.minify && protectedStrings.length > 0) {
        config.logger.warn(colors.yellow('Strings cannot be protected when minification is enabled.'))
      }
    },
    renderChunk(code, chunk, { sourcemap }): { code: string; map?: SourceMapInput } | null {
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
      const chunks = _chunks.filter(chunk => chunk.type === 'chunk' && isBytecodeChunk(chunk.name)) as OutputChunk[]

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

      await Promise.all(
        bundles.map(async name => {
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
              const bytecodeBuffer = await compileToBytecode(_code)
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
                  if (moduleInfo && !moduleInfo.isExternal) {
                    const { importers, dynamicImporters } = moduleInfo
                    for (const importerId of importers) idsToHandle.add(importerId)
                    for (const importerId of dynamicImporters) idsToHandle.add(importerId)
                  }
                }
                _code = hasBytecodeMoudle
                  ? _code.replace(
                      /("use strict";)|('use strict';)/,
                      `${useStrict}\n${getBytecodeLoaderBlock(chunk.fileName)}`
                    )
                  : _code
              }
              chunk.code = _code
            }
          }
        })
      )

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
        logger.info(`${colors.green(`✓`)} ${bytecodeChunkCount} chunks compiled into bytecode.`)
      }
    }
  }
}

function resolveBuildOutputs(
  outputs: OutputOptions | OutputOptions[] | undefined,
  libOptions: LibraryOptions | false
): OutputOptions | OutputOptions[] | undefined {
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
  return {
    name: 'protect-strings-plugin',
    visitor: {
      StringLiteral(path, state) {
        if (
          path.parentPath.isImportDeclaration() || // import x from 'module'
          path.parentPath.isExportNamedDeclaration() || // export { x } from 'module'
          path.parentPath.isExportAllDeclaration() || // export * from 'module'
          path.parentPath.isObjectProperty({ key: path.node, computed: false }) // { 'key': 'value' }
        ) {
          return
        }

        const { value } = path.node
        if (state.opts.protectedStrings.has(value)) {
          const charCodes = Array.from(value).map(s => s.charCodeAt(0))
          const charCodeLiterals = charCodes.map(code => t.numericLiteral(code))
          const replacement = t.callExpression(
            t.memberExpression(t.identifier('String'), t.identifier('fromCharCode')),
            charCodeLiterals
          )
          path.replaceWith(replacement)
        }
      }
    }
  }
}
