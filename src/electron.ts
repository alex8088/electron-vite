import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { type Logger } from 'vite'

const _require = createRequire(import.meta.url)

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

const getElectronMajorVer = (): string => {
  let majorVer = process.env.ELECTRON_MAJOR_VER || ''
  if (!majorVer) {
    const pkg = _require.resolve('electron/package.json')
    if (fs.existsSync(pkg)) {
      const version = _require(pkg).version
      majorVer = version.split('.')[0]
      process.env.ELECTRON_MAJOR_VER = majorVer
    }
  }
  return majorVer
}

export function getElectronPath(): string {
  let electronExecPath = process.env.ELECTRON_EXEC_PATH || ''
  if (!electronExecPath) {
    const electronModulePath = path.dirname(_require.resolve('electron'))
    const pathFile = path.join(electronModulePath, 'path.txt')
    let executablePath
    if (fs.existsSync(pathFile)) {
      executablePath = fs.readFileSync(pathFile, 'utf-8')
    }
    if (executablePath) {
      electronExecPath = path.join(electronModulePath, 'dist', executablePath)
      process.env.ELECTRON_EXEC_PATH = electronExecPath
    } else {
      throw new Error('Electron uninstall')
    }
  }
  return electronExecPath
}

export function getElectronNodeTarget(): string {
  const electronVer = getElectronMajorVer()

  const nodeVer = {
    '21': '16.16',
    '20': '16.15',
    '19': '16.14',
    '18': '16.13',
    '17': '16.13',
    '16': '16.9',
    '15': '16.5',
    '14': '14.17',
    '13': '14.17',
    '12': '14.16',
    '11': '12.18'
  }
  if (electronVer && parseInt(electronVer) > 10) {
    let target = nodeVer[electronVer]
    if (!target) target = Object.values(nodeVer).reverse()[0]
    return 'node' + target
  }
  return ''
}

export function getElectronChromeTarget(): string {
  const electronVer = getElectronMajorVer()

  const chromeVer = {
    '21': '106',
    '20': '104',
    '19': '102',
    '18': '100',
    '17': '98',
    '16': '96',
    '15': '94',
    '14': '93',
    '13': '91',
    '12': '89',
    '11': '87'
  }
  if (electronVer && parseInt(electronVer) > 10) {
    let target = chromeVer[electronVer]
    if (!target) target = Object.values(chromeVer).reverse()[0]
    return 'chrome' + target
  }
  return ''
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
