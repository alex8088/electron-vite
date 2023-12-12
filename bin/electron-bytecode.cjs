const vm = require('vm')
const v8 = require('v8')
const wrap = require('module').wrap

v8.setFlagsFromString('--no-lazy')
v8.setFlagsFromString('--no-flush-bytecode')

let code = ''

process.stdin.setEncoding('utf-8')

process.stdin.on('readable', () => {
  const data = process.stdin.read()
  if (data !== null) {
    code += data
  }
})

process.stdin.on('end', () => {
  try {
    if (typeof code !== 'string') {
      throw new Error(`javascript code must be string. ${typeof code} was given.`)
    }

    const script = new vm.Script(wrap(code), { produceCachedData: true })
    const bytecodeBuffer = script.createCachedData()

    process.stdout.write(bytecodeBuffer)
  } catch (error) {
    console.error(error)
  }
})
