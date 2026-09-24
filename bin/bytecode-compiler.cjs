const vm = require('node:vm')
const v8 = require('node:v8')

v8.setFlagsFromString('--no-lazy')
v8.setFlagsFromString('--no-flush-bytecode')

const params = ['exports', 'require', 'module', '__filename', '__dirname']

module.exports = function compile(code) {
  if (typeof code !== 'string') throw new TypeError('Compilation source must be a string')
  const { cachedData } = vm.compileFunction(code, params, { produceCachedData: true })
  if (!Buffer.isBuffer(cachedData)) throw new Error('V8 did not produce cached data')
  // Explicit wire format works across both Node IPC and Electron structured clone.
  return { sourceLength: code.length, cachedData: cachedData.toString('base64') }
}
