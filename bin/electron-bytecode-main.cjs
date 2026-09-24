const fs = require('node:fs')
const Module = require('node:module')
const v8 = require('node:v8')
const vm = require('node:vm')
const { app } = require('electron')

v8.setFlagsFromString('--no-lazy')
v8.setFlagsFromString('--no-flush-bytecode')
app.disableHardwareAcceleration()

async function compile() {
  const manifestPath = process.argv[2]
  if (!manifestPath) {
    throw new Error('Bytecode compiler manifest path is required')
  }

  const jobs = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  for (const job of jobs) {
    const code = fs.readFileSync(job.input, 'utf8')
    const script = new vm.Script(Module.wrap(code), { produceCachedData: true })
    fs.writeFileSync(job.output, script.createCachedData())
  }
}

app
  .whenReady()
  .then(compile)
  .then(() => app.exit(0))
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    app.exit(1)
  })
