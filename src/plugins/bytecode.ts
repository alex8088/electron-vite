import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import colors from 'picocolors'
import { type Plugin, type ResolvedConfig, normalizePath } from 'vite'
import * as babel from '@babel/core'
import { getElectronPath } from '../electron'

// Inspired by https://github.com/bytenode/bytenode

function getBytecodeCompilerPath(): string {
  return path.resolve(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-bytecode.js')
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
  `Module._extensions[".jsc"] = function (module, filename) {`,
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

export interface BytecodeOptions {
  chunkAlias?: string | string[]
  transformArrowFunctions?: boolean
  removeBundleJS?: boolean
}

/**
 * Compile to v8 bytecode to protect source code.
 */
export function bytecodePlugin(options: BytecodeOptions = {}): Plugin | null {
  if (process.env.NODE_ENV_ELECTRON_VITE !== 'production') {
    return null
  }

  const { chunkAlias = [], transformArrowFunctions = true, removeBundleJS = true } = options
  const _chunkAlias = Array.isArray(chunkAlias) ? chunkAlias : [chunkAlias]
  const transformAllChunks = _chunkAlias.length === 0
  const bytecodeChunks: string[] = []
  const nonEntryChunks: string[] = []
  const _transform = (code: string): string => {
    const re = babel.transform(code, {
      plugins: ['@babel/plugin-transform-arrow-functions']
    })
    return re.code || ''
  }
  const requireBytecodeLoaderStr = '"use strict";\nrequire("./bytecode-loader.js");'
  let config: ResolvedConfig
  let useInRenderer = false
  let bytecodeFiles: { name: string; size: number }[] = []
  return {
    name: 'vite:bytecode',
    apply: 'build',
    enforce: 'post',
    configResolved(resolvedConfig): void {
      config = resolvedConfig
      useInRenderer = config.plugins.some(p => p.name === 'vite:electron-renderer-preset-config')
      if (useInRenderer) {
        config.logger.warn(colors.yellow('bytecodePlugin is not support renderers'))
      }
    },
    renderChunk(code, chunk): { code: string } | null {
      if (useInRenderer) {
        return null
      }
      if (!transformAllChunks) {
        const isBytecodeChunk = _chunkAlias.some(alias => chunk.fileName.startsWith(alias))
        if (isBytecodeChunk) {
          bytecodeChunks.push(chunk.fileName)
          if (!chunk.isEntry) {
            nonEntryChunks.push(chunk.fileName)
          }
          if (transformArrowFunctions) {
            return {
              code: _transform(code)
            }
          }
        }
      } else {
        if (chunk.type === 'chunk') {
          bytecodeChunks.push(chunk.fileName)
          if (!chunk.isEntry) {
            nonEntryChunks.push(chunk.fileName)
          }
          if (transformArrowFunctions) {
            return {
              code: _transform(code)
            }
          }
        }
      }
      return null
    },
    generateBundle(): void {
      if (!useInRenderer && bytecodeChunks.length) {
        this.emitFile({
          type: 'asset',
          source: bytecodeModuleLoaderCode.join('\n') + '\n',
          name: 'Bytecode Loader File',
          fileName: 'bytecode-loader.js'
        })
      }
    },
    async writeBundle(options, output): Promise<void> {
      if (useInRenderer || bytecodeChunks.length === 0) {
        return
      }
      const bundles = Object.keys(output)
      const outDir = options.dir!
      bytecodeFiles = []
      await Promise.all(
        bundles.map(async name => {
          const chunk = output[name]
          if (chunk.type === 'chunk') {
            let _code = chunk.code
            nonEntryChunks.forEach(bcc => {
              if (bcc !== name) {
                const reg = new RegExp(bcc, 'g')
                _code = _code.replace(reg, `${bcc}c`)
              }
            })
            const chunkFileName = path.resolve(outDir, name)
            if (bytecodeChunks.includes(name)) {
              const bytecodeBuffer = await compileToBytecode(_code)
              const bytecodeFileName = path.resolve(outDir, name + 'c')
              fs.writeFileSync(bytecodeFileName, bytecodeBuffer)
              if (chunk.isEntry) {
                if (!removeBundleJS) {
                  const newFileName = path.resolve(outDir, `_${name}`)
                  fs.renameSync(chunkFileName, newFileName)
                }
                const code = requireBytecodeLoaderStr + `\nrequire("./${normalizePath(name + 'c')}");\n`
                fs.writeFileSync(chunkFileName, code)
              } else {
                if (removeBundleJS) {
                  fs.unlinkSync(chunkFileName)
                } else {
                  const newFileName = path.resolve(outDir, `_${name}`)
                  fs.renameSync(chunkFileName, newFileName)
                }
              }
              bytecodeFiles.push({ name: name + 'c', size: bytecodeBuffer.length })
            } else {
              if (chunk.isEntry) {
                _code = _code.replace('"use strict";', requireBytecodeLoaderStr)
              }
              fs.writeFileSync(chunkFileName, _code)
            }
          }
        })
      )
    },
    closeBundle(): void {
      if (!useInRenderer) {
        const chunkLimit = config.build.chunkSizeWarningLimit
        const outDir = normalizePath(path.relative(config.root, path.resolve(config.root, config.build.outDir))) + '/'
        config.logger.info(`${colors.green(`✓`)} ${bytecodeFiles.length} bundles compiled into bytecode.`)
        let longest = 0
        bytecodeFiles.forEach(file => {
          const len = file.name.length
          if (len > longest) longest = len
        })
        bytecodeFiles.forEach(file => {
          const kibs = file.size / 1024
          config.logger.info(
            `${colors.gray(colors.white(colors.dim(outDir)))}${colors.green(file.name.padEnd(longest + 2))} ${
              kibs > chunkLimit ? colors.yellow(`${kibs.toFixed(2)} KiB`) : colors.dim(`${kibs.toFixed(2)} KiB`)
            }`
          )
        })
        bytecodeFiles = []
      }
    }
  }
}
