import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { type ChildProcess, spawn } from 'node:child_process'
import { loadPackageData } from './utils'

const _require = createRequire(import.meta.url)

const ensureElectronEntryFile = (root = process.cwd()): void => {
  if (process.env.ELECTRON_ENTRY) return
  const pkg = loadPackageData()
  if (pkg) {
    if (!pkg.main) {
      throw new Error('No entry point found for electron app, please add a "main" field to package.json')
    } else {
      const entryPath = path.resolve(root, pkg.main)
      if (!fs.existsSync(entryPath)) {
        throw new Error(`No electron app entry file found: ${entryPath}`)
      }
    }
  } else {
    throw new Error('Not found: package.json')
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

export function supportESM(): boolean {
  const majorVer = getElectronMajorVer()
  return parseInt(majorVer) >= 28
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
    '29': '20.9',
    '28': '18.18',
    '27': '18.17',
    '26': '18.16',
    '25': '18.15',
    '24': '18.14',
    '23': '18.12',
    '22': '16.17',
    '21': '16.16',
    '20': '16.15',
    '19': '16.14',
    '18': '16.13',
    '17': '16.13',
    '16': '16.9',
    '15': '16.5',
    '14': '14.17',
    '13': '14.17'
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
    '29': '122',
    '28': '120',
    '27': '118',
    '26': '116',
    '25': '114',
    '24': '112',
    '23': '110',
    '22': '108',
    '21': '106',
    '20': '104',
    '19': '102',
    '18': '100',
    '17': '98',
    '16': '96',
    '15': '94',
    '14': '93',
    '13': '91'
  }
  if (electronVer && parseInt(electronVer) > 10) {
    let target = chromeVer[electronVer]
    if (!target) target = Object.values(chromeVer).reverse()[0]
    return 'chrome' + target
  }
  return ''
}

export function startElectron(root: string | undefined): ChildProcess {
  ensureElectronEntryFile(root)

  const electronPath = getElectronPath()

  const isDev = process.env.NODE_ENV_ELECTRON_VITE === 'development'

  const args: string[] = process.env.ELECTRON_CLI_ARGS ? JSON.parse(process.env.ELECTRON_CLI_ARGS) : []

  if (!!process.env.REMOTE_DEBUGGING_PORT && isDev) {
    args.push(`--remote-debugging-port=${process.env.REMOTE_DEBUGGING_PORT}`)
  }

  if (!!process.env.V8_INSPECTOR_PORT && isDev) {
    args.push(`--inspect=${process.env.V8_INSPECTOR_PORT}`)
  }

  if (!!process.env.V8_INSPECTOR_BRK_PORT && isDev) {
    args.push(`--inspect-brk=${process.env.V8_INSPECTOR_BRK_PORT}`)
  }

  if (process.env.NO_SANDBOX === '1') {
    args.push('--no-sandbox')
  }

  const entry = process.env.ELECTRON_ENTRY || '.'

  const ps = spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })
  ps.on('close', process.exit)

  return ps
}
