const { ipcRenderer } = require('electron')
const RpcPeer = require('./rpc-peer.cjs')
const compile = require('./bytecode-compiler.cjs')

const channel = 'electron-vite:bytecode:rpc'
const rpc = new RpcPeer(message => ipcRenderer.send(channel, message))
rpc.register('ready', () => true)
rpc.register('compile', compile)
ipcRenderer.on(channel, (_event, message) => void rpc.receive(message))
ipcRenderer.send('electron-vite:bytecode:ready')
