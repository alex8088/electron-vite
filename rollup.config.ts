import { createRequire } from 'node:module'
import { defineConfig } from 'rollup'
import ts from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'
import dts from 'rollup-plugin-dts'
import rm from 'rollup-plugin-rm'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const external = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]

export default defineConfig([
  {
    input: ['src/index.ts', 'src/cli.ts'],
    output: [
      {
        dir: 'dist',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/lib-[hash].js',
        format: 'es'
      }
    ],
    external,
    plugins: [
      rm('dist', 'buildStart'),
      json(),
      ts({ compilerOptions: { rootDir: 'src', declaration: true, declarationDir: 'dist/types' } }),
      resolve()
    ],
    treeshake: {
      moduleSideEffects: false
    }
  },
  {
    input: 'dist/types/index.d.ts',
    output: [{ file: pkg.types, format: 'es' }],
    plugins: [dts(), rm('dist/types', 'buildEnd')]
  }
])
