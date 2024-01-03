import { URL, URLSearchParams } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { loadEnv as viteLoadEnv } from 'vite'

export function isObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export const wildcardHosts = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000'])

export function resolveHostname(optionsHost: string | boolean | undefined): string {
  return typeof optionsHost === 'string' && !wildcardHosts.has(optionsHost) ? optionsHost : 'localhost'
}

export const queryRE = /\?.*$/s
export const hashRE = /#.*$/s

export const cleanUrl = (url: string): string => url.replace(hashRE, '').replace(queryRE, '')

export function parseRequest(id: string): Record<string, string> | null {
  const { search } = new URL(id, 'file:')
  if (!search) {
    return null
  }
  return Object.fromEntries(new URLSearchParams(search))
}

export function getHash(text: Buffer | string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 8)
}

export function toRelativePath(filename: string, importer: string): string {
  const relPath = path.posix.relative(path.dirname(importer), filename)
  return relPath.startsWith('.') ? relPath : `./${relPath}`
}

/**
 * Load `.env` files within the `envDir` (default: `process.cwd()`) .
 * By default, only env variables prefixed with `VITE_`, `MAIN_VITE_`, `PRELOAD_VITE_` and
 * `RENDERER_VITE_` are loaded, unless `prefixes` is changed.
 */
export function loadEnv(
  mode: string,
  envDir: string = process.cwd(),
  prefixes: string | string[] = ['VITE_', 'MAIN_VITE_', 'PRELOAD_VITE_', 'RENDERER_VITE_']
): Record<string, string> {
  return viteLoadEnv(mode, envDir, prefixes)
}

interface PackageData {
  main?: string
  type?: 'module' | 'commonjs'
  dependencies?: Record<string, string>
}

let packageCached: PackageData | null = null

export function loadPackageData(root = process.cwd()): PackageData | null {
  if (packageCached) return packageCached
  const pkg = path.join(root, 'package.json')
  if (fs.existsSync(pkg)) {
    const _require = createRequire(import.meta.url)
    const data = _require(pkg)
    packageCached = {
      main: data.main,
      type: data.type,
      dependencies: data.dependencies
    }
    return packageCached
  }
  return null
}

export function isFilePathESM(filePath: string): boolean {
  if (/\.m[jt]s$/.test(filePath) || filePath.endsWith('.ts')) {
    return true
  } else if (/\.c[jt]s$/.test(filePath)) {
    return false
  } else {
    const pkg = loadPackageData()
    return pkg?.type === 'module'
  }
}
