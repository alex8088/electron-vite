import { URL, URLSearchParams } from 'node:url'
import { loadEnv as viteLoadEnv } from 'vite'

export function isObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export const dynamicImport = new Function('file', 'return import(file)')

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

/**
 * Load `.env` files within the `envDir`(default: `process.cwd()`).
 * By default, only env variables prefixed with `MAIN_VITE_`, `PRELOAD_VITE_` and
 * `RENDERER_VITE_` are loaded, unless `prefixes` is changed.
 */
export function loadEnv(
  mode: string,
  envDir: string = process.cwd(),
  prefixes: string | string[] = ['MAIN_VITE_', 'PRELOAD_VITE_', 'RENDERER_VITE_']
): Record<string, string> {
  return viteLoadEnv(mode, envDir, prefixes)
}
