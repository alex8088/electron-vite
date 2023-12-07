const path = require('path')
const colors = require('picocolors')
const fs = require('fs-extra')
const rollup = require('rollup')
const typescript = require('@rollup/plugin-typescript')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const { dts } = require('rollup-plugin-dts')

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
        tsconfig: path.resolve(__dirname, '../tsconfig.json'),
        compilerOptions: { rootDir: 'src' }
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
    const bundle = await rollup.rollup({
      input: path.resolve(__dirname, '../dist/types/index.d.ts'),
      external,
      plugins: [dts()]
    })
    await bundle.write({
      file: pkg.types,
      format: 'es'
    })
  }

  await fs.remove(path.resolve(dist, 'types'))

  console.log(colors.green(`Build ${pkg.name}@${pkg.version} successfully`))
})()
