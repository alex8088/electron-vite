import * as path from 'path'
import * as fs from 'fs'

export function isObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export const dynamicImport = new Function('file', 'return import(file)')

export function ensureElectronEntryFile(root = process.cwd()): void {
  const pkg = path.join(root, 'package.json')
  if (fs.existsSync(pkg)) {
    const main = require(pkg).main
    if (!main) {
      throw new Error('not found an entry point to electorn app, please add main field for your package.json')
    } else {
      const entryPath = path.resolve(root, main)
      if (!fs.existsSync(entryPath)) {
        throw new Error(`not found the electorn app entry file: ${entryPath}`)
      }
    }
  } else {
    throw new Error('no package.json')
  }
}

export function getElectronPath(): string {
  const electronModulePath = path.resolve(process.cwd(), 'node_modules', 'electron')
  const pathFile = path.join(electronModulePath, 'path.txt')
  let executablePath
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8')
  }
  if (executablePath) {
    return path.join(electronModulePath, 'dist', executablePath)
  } else {
    throw new Error('Electron uninstall')
  }
}

export const wildcardHosts = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000'])

export function resolveHostname(optionsHost: string | boolean | undefined): string {
  return typeof optionsHost === 'string' && !wildcardHosts.has(optionsHost) ? optionsHost : 'localhost'
}
