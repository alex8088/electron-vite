// Inspired by https://github.com/bytenode/bytenode

import path from 'node:path'
import { spawn } from 'node:child_process'
import { getElectronPath } from './electron'

const getBytecodeCompilerPath = (): string => {
  return path.resolve(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-bytecode.js')
}

export const compileToBytecode = (code: string): Promise<Buffer> => {
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

export const bytecodeModuleLoaderCode = [
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
