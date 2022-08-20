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

- ⚡️ Inherit all the benefits of Vite and use the same way as  [Vite](https://vitejs.dev).
- 📦The main process, renderers and preload scripts are all built with Vite.
- 🛠The main process, renderers and preload scripts Vite configuration combined into one file.
- 💡Pre-configured for Electron, don't worry about configuration.
- 🚀HMR for renderer processes.

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

### Getting Started

Clone the [electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) or use the [create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron) tool to scaffold your project.

```bash
npm init @quick-start/electron
```

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

[MIT](./LICENSE) © alex.wei
