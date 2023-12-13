import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { type Plugin, defineConfig } from 'rollup'
import ts from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'
import dts from 'rollup-plugin-dts'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const external = ['esbuild', ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]

function clean(when: 'buildStart' | 'buildEnd', target: string): Plugin {
  const _clean = async (target): Promise<void> => {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
  }
  return {
    name: 'clean',
    buildStart: async (): Promise<void> => {
      if (when !== 'buildStart') return
      await _clean(target)
    },
    buildEnd: async (): Promise<void> => {
      if (when !== 'buildEnd') return
      await _clean(target)
    }
  }
}

export default defineConfig([
  {
    input: ['src/index.ts', 'src/cli.ts'],
    output: [
      {
        dir: 'dist',
        entryFileNames: '[name].cjs',
        chunkFileNames: 'chunks/lib-[hash].cjs',
        format: 'cjs'
      },
      {
        dir: 'dist',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/lib-[hash].mjs',
        format: 'es'
      }
    ],
    external,
    plugins: [
      clean('buildStart', 'dist'),
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
    plugins: [dts(), clean('buildEnd', 'dist/types')]
  }
])
