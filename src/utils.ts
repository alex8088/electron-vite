export function isObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export const dynamicImport = new Function('file', 'return import(file)')

export const wildcardHosts = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000'])

export function resolveHostname(optionsHost: string | boolean | undefined): string {
  return typeof optionsHost === 'string' && !wildcardHosts.has(optionsHost) ? optionsHost : 'localhost'
}
