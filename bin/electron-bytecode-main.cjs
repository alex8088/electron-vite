const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const RpcPeer = require('./rpc-peer.cjs')
const compile = require('./bytecode-compiler.cjs')

if (process.platform === 'darwin') {
  app.dock.hide()
}

const channel = 'electron-vite:bytecode:rpc'
const readyChannel = 'electron-vite:bytecode:ready'
let win
let rendererRPC
let stopping = false

function fail(error) {
  console.error(error)
  parentRPC.close(error)
  rendererRPC?.close(error)
  app.exit(1)
}

const parentRPC = new RpcPeer(
  message =>
    new Promise((resolve, reject) => {
      if (!process.connected || !process.send) return reject(new Error('Parent IPC is disconnected'))
      process.send(message, error => (error ? reject(error) : resolve()))
    })
)

function createRenderer() {
  return new Promise((resolve, reject) => {
    let ready = false
    const timer = setTimeout(() => finish(new Error('Compiler preload readiness timed out')), 30000)
    function finish(error) {
      clearTimeout(timer)
      ipcMain.removeListener(readyChannel, onReady)
      if (error) reject(error)
      else {
        ready = true
        resolve()
      }
    }
    function onReady(event) {
      if (event.sender === win.webContents) finish()
    }
    function onFailure(error) {
      if (stopping) return
      if (ready) fail(error)
      else finish(error)
    }
    ipcMain.on(readyChannel, onReady)
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'electron-bytecode-preload.cjs'),
        sandbox: false,
        contextIsolation: true
      }
    })
    rendererRPC = new RpcPeer(message => {
      if (win.isDestroyed()) throw new Error('Compiler window is closed')
      win.webContents.send(channel, message)
    })
    ipcMain.on(channel, (event, message) => {
      if (!win.isDestroyed() && event.sender === win.webContents) void rendererRPC.receive(message)
    })
    win.webContents.on('preload-error', (_event, _path, error) => onFailure(error))
    win.webContents.on('render-process-gone', (_event, details) => {
      onFailure(new Error(`Compiler renderer exited: ${details.reason}`))
    })
    win.on('closed', () => onFailure(new Error('Compiler window closed unexpectedly')))
    win.loadURL('data:text/html,<!doctype html><html></html>').catch(onFailure)
  })
}

// Register readiness immediately, but only resolve it after the selected backend is usable.
const initialized = app.whenReady().then(async () => {
  if (process.env.ELECTRON_VITE_RENDERER === '1' || process.env.ELECTRON_VITE_RENDERER === 'true') {
    await createRenderer()
    parentRPC.register('compile', (...args) => rendererRPC.request('compile', ...args))
  } else {
    parentRPC.register('compile', compile)
  }
  return true
})
parentRPC.register('ready', () => initialized)
initialized.catch(fail)

process.on('message', message => {
  if (message?.type === 'shutdown') {
    stopping = true
    app.quit()
  } else {
    void parentRPC.receive(message)
  }
})
process.on('disconnect', () => {
  stopping = true
  app.quit()
})
app.on('before-quit', () => {
  stopping = true
  parentRPC.close()
  rendererRPC?.close()
})
if (!process.send) fail(new Error('Bytecode compiler must be launched with an IPC channel'))
