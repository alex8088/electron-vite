const path = require('path')
const colors = require('picocolors')
const fs = require('fs-extra')
const rollup = require('rollup')
const typescript = require('@rollup/plugin-typescript')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor')

;(async () => {
  const dist = path.resolve(__dirname, '../dist')

  await fs.remove(dist)

  console.log()
  console.log(colors.bold(colors.yellow(`Rolling up ts code...`)))

  const pkg = require('../package.json')

  const external = ['esbuild', ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]

  const bundle = await rollup.rollup({
    input: {
      index: path.resolve(__dirname, '../src/index.ts'),
      cli: path.resolve(__dirname, '../src/cli.ts')
    },
    external,
    plugins: [
      typescript({
        tsconfig: path.resolve(__dirname, '../tsconfig.json')
      }),
      nodeResolve()
    ],
    treeshake: {
      moduleSideEffects: false
    }
  })
  await bundle.write({
    dir: dist,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/lib-[hash].js',
    format: 'cjs'
  })

  console.log(colors.bold(colors.yellow(`Rolling up type definitions...`)))

  if (pkg.types) {
    const extractorConfig = ExtractorConfig.loadFileAndPrepare(path.resolve(__dirname, '../api-extractor.json'))
    const extractorResult = Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: true
    })

    if (extractorResult.succeeded) {
      console.log(colors.green('API Extractor completed successfully'))
    } else {
      console.error(
        `API Extractor completed with ${extractorResult.errorCount} errors` +
          ` and ${extractorResult.warningCount} warnings`
      )
      process.exitCode = 1
    }
  }

  await fs.remove(path.resolve(dist, 'types'))

  console.log(colors.green(`Build ${pkg.name}@${pkg.version} successfully`))
})()
