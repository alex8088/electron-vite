<p align="center">
  <img src="https://alex8088.github.io/assets/electron-vite.svg" width="150px" height="150px">
</p>

<div align="center">
  <h1>electron-vite</h1>
</div>
<p align="center">Next generation Electron build tooling based on Vite</p>

<p align="center">
<img src="https://img.shields.io/npm/v/electron-vite?color=6988e6&label=version">
<img src="https://img.shields.io/github/license/alex8088/electron-vite?color=blue" alt="license" />
</p>

<p align="center">
<a href="https://electron-vite.org">Documentation</a> |
<a href="https://electron-vite.org/guide">Getting Started</a> |
<a href="https://github.com/alex8088/quick-start/tree/master/packages/create-electron">create-electron</a>
</p>

<p align="center">
<a href="https://cn.electron-vite.org">中文文档</a>
</p>

<br />
<br />

## Features

- ⚡️ [Vite](https://vitejs.dev) powered and use the same way.
- 🛠 Pre-configured for Electron, don't worry about configuration.
- 💡 Optimize asset handling (Node.js addons, WebAssembly, Worker Thread, etc).
- 🚀 Fast HMR for renderer processes.
- 🔥 Hot reloading for main process and preload scripts.
- 🔌 Easy to debug in IDEs like VSCode or WebStorm.
- 🔒 Compile to v8 bytecode to protect source code.
- 🏷️ Support for TypeScript decorators.
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

### Configuration

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

### Getting Started

Clone the [electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) or use the [create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron) tool to scaffold your project.

```bash
npm create @quick-start/electron
```

Currently supported template presets include:

|                                                 JavaScript                                                 |                                                    TypeScript                                                    |
| :--------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------: |
| [vanilla](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/vanilla) | [vanilla-ts](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/vanilla-ts) |
|     [vue](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/vue)     |     [vue-ts](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/vue-ts)     |
|   [react](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/react)   |   [react-ts](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/react-ts)   |
|  [svelte](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/svelte)  |  [svelte-ts](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/svelte-ts)  |
|   [solid](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/solid)   |   [solid-ts](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/solid-ts)   |

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

[MIT](./LICENSE) © alex.wei
