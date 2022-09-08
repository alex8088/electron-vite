import path from 'node:path'
import fs from 'node:fs'
import { type ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { type Logger } from 'vite'

const ensureElectronEntryFile = (root = process.cwd()): void => {
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

const getElectronPath = (): string => {
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

export function startElectron(root: string | undefined, logger: Logger): ChildProcessWithoutNullStreams {
  ensureElectronEntryFile(root)

  const electronPath = getElectronPath()

  const ps = spawn(electronPath, ['.'])
  ps.stdout.on('data', chunk => {
    chunk.toString().trim() && logger.info(chunk.toString())
  })
  ps.stderr.on('data', chunk => {
    chunk.toString().trim() && logger.error(chunk.toString())
  })
  ps.on('close', process.exit)

  return ps
}
