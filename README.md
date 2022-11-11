<p align="center">
  <img src="https://alex8088.github.io/assets/electron-vite.svg" width="150px" height="150px">
</p>

<div align="center">
  <h1>electron-vite</h1>
</div>
<p align="center">Next generation Electron build tooling based on Vite</p>

<p align="center">
<img src="https://img.shields.io/npm/v/electron-vite?color=6988e6&label=version">
<img src="https://img.shields.io/github/license/alex8088/wx-vue-next?color=blue" alt="license" />
</p>

<p align="center">
<a href="https://evite.netlify.app/">Documentation</a> |
<a href="https://evite.netlify.app/guide/">Getting Started</a> |
<a href="https://github.com/alex8088/quick-start/tree/master/packages/create-electron">create-electron</a>
</p>

<p align="center">
<a href="https://cn-evite.netlify.app/">中文文档</a>
</p>

<br />
<br />

## Features

- ⚡️  [Vite](https://vitejs.dev) powered and use the same way.
- 🛠 Centralized Configuration.
- 💡 Pre-configured for Electron, don't worry about configuration.
- 🚀 Fast HMR for renderers.
- 🔥 Hot reloading for main process and preload scripts.
- 🔌 Easy to debug.
- 🔒 Compile to v8 bytecode to protect source code.
- 🏷️ Support for TypeScript decorators.
- 🔩 Easy to use workers and fork process.
- 📦 Out-of-the-box support for TypeScript, Vue, React, Svelte, SolidJS and more.

## Usage

### Install

```sh
npm i electron-vite -D
```

### Development & Build

In a project where `electron-vite` is installed, you can use `electron-vite` binary directly with `npx electron-vite` or add the npm scripts to your `package.json` file like this:

```json
{
  "scripts": {
    "start": "electron-vite preview",
    "dev": "electron-vite dev",
    "prebuild": "electron-vite build"
  }
}
```

### Configuring

When running `electron-vite` from the command line, electron-vite will automatically try to resolve a config file named `electron.vite.config.js` inside project root. The most basic config file looks like this:

```js
// electron.vite.config.js
export default {
  main: {
    // vite config options
  },
  preload: {
    // vite config options
  },
  renderer: {
    // vite config options
  }
}
```

### Use HMR in Renderer

In order to use the renderer process HMR, you need to use the `environment variables` to determine whether the window browser loads a local html file or a local URL.

```js
function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  // Load the remote URL for development or the local html file for production
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}
```

### Hot Reloading

Hot reloading refers to quickly rebuilding and restarting the Electron app when the main process or preload scripts module changes. In fact, it's not really hot reloading, but similar. It also brings a good development experience to developers.

There are two ways to enable it:

1. Use CLI option `-w` or `--watch`, e.g. `electron-vite dev --watch`. This is the preferred way, it's more flexible.

2. Use configuration option `build.watch` and set to `{}`. In addition, more watcher options can be configured, see [WatcherOptions](https://rollupjs.org/guide/en/#watch-options).

### Debugging in VSCode

Add a file `.vscode/launch.json` with the following configuration:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceRoot}",
      "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/electron-vite",
      "windows": {
        "runtimeExecutable": "${workspaceRoot}/node_modules/.bin/electron-vite.cmd"
      },
      "runtimeArgs": ["--sourcemap"]
    }
  ]
}
```

Then, set some breakpoints in `main.ts` (source code), and start debugging in the `VSCode Debug View`.

### Source Code Protection

Use the plugin `bytecodePlugin` to enable it:

```js
import { defineConfig, bytecodePlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [bytecodePlugin()]
  },
  preload: {
    plugins: [bytecodePlugin()]
  },
  renderer: {
    // ...
  }
})
```

`bytecodePlugin` only works in production and supports the main process and preload scripts.

Also, you can learn more by playing with the [example](https://github.com/alex8088/electron-vite-bytecode-example).

### Getting Started

Clone the [electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) or use the [create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron) tool to scaffold your project.

```bash
npm init @quick-start/electron
```

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

[MIT](./LICENSE) © alex.wei
