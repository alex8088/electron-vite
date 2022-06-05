# electron-vite

<p>
  <img src="https://img.shields.io/badge/node->14.0.0-blue.svg" alt="node" />
  <img src="https://img.shields.io/badge/vite->2.6.0-747bff.svg" alt="vite" />
</p>

English | [简体中文](./README.zh-CN.md)

> An Electron CLI integrated with Vite

---

## Features

- ⚡️Use the same way as [Vite](https://vitejs.dev)
- 🔨Main process, renderer process and preload script source code are built using Vite
- 📃Main process, renderer process and preload script Vite configuration combined into one file
- 📦Preset optimal build configuration
- 🚀HMR for renderer processes

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
    "start": "electron-vite preview", // start electron app to preview production build
    "dev": "electron-vite dev", // start dev server and electron app
    "prebuild": "electron-vite build" // build for production
  }
}
```

In order to use the renderer process HMR, you need to use the `environment variables` to determine whether the window browser loads a local html file or a remote URL.

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

**Note**: For development, the renderer process `index.html` file needs to reference your script code via `<script type="module">`.

### Recommended project directory

```shell
├──src
│  ├──main
│  │  ├──index.js
│  │  └──...
│  ├──preload
│  │  ├──index.js
│  │  └──...
│  └──renderer
│     ├──src
│     ├──index.html
│     └──...
├──electron.vite.config.js
└──package.json
```

### Get started

Clone the [electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) or use the [create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron) tool to scaffold your project.

```bash
npm init @quick-start/electron
```

## Configure

### Config file

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

You can also explicitly specify a config file to use with the `--config` CLI option (resolved relative to `cwd`):

```sh
electron-vite --config my-config.js
```

**Tips**: `electron-vite` also supports `ts` or `mjs` config file.

### Config intellisense

Since `electron-vite` ships with TypeScript typings, you can leverage your IDE's intellisense with jsdoc type hints:

```js
/**
 * @type {import('electron-vite').UserConfig}
 */
const config = {
  // ...
}

export default config
```

Alternatively, you can use the `defineConfig` and `defineViteConfig` helper which should provide intellisense without the need for jsdoc annotations:

```js
import { defineConfig, defineViteConfig } from 'electron-vite'

export default defineConfig({
  main: {
    // ...
  },
  preload: {
    // ...
  },
  renderer: defineViteConfig(({ command, mode }) => {
    // conditional config use defineViteConfig
    // ...
  })
})
```

**Tips**: The `defineViteConfig` exports from `Vite`.

### Config reference

See [vitejs.dev](https://vitejs.dev/config)

### Config presets

#### Build options for `main`:

- **outDir**: `out\main`(relative to project root)
- **target**: `node*`, automatically match node target of `Electron`. For example, the node target of Electron 17 is `node16.13`
- **lib.entry**: `src\main\{index|main}.{js|ts|mjs|cjs}`(relative to project root), empty string if not found
- **lib.formats**: `cjs`
- **rollupOptions.external**: `electron` and all builtin modules

#### Build options for `preload`:

- **outDir**: `out\preload`(relative to project root)
- **target**: the same as `main`
- **lib.entry**: `src\preload\{index|preload}.{js|ts|mjs|cjs}`(relative to project root), empty string if not found
- **lib.formats**: `cjs`
- **rollupOptions.external**: the same as `main`

#### Build options for `renderer`:

- **root**: `src\renderer`(relative to project root)
- **outDir**: `out\renderer`(relative to project root)
- **target**: `chrome*`, automatically match chrome target of `Electron`. For example, the chrome target of Electron 17 is `chrome98`
- **lib.entry**: `src\renderer\index.html`(relative to project root), empty string if not found
- **polyfillModulePreload**: `false`, there is no need to polyfill `Module Preload` for the Electron renderer
- **rollupOptions.external**: the same as `main`

#### Define option for `main` and `preload`

In web development, Vite will transform `'process.env.'` to `'({}).'`. This is reasonable and correct. But in nodejs development, we sometimes need to use `process.env`, so `electron-vite` will automatically add config define field to redefine global variable replacements like this:

```js
export default {
  main: {
    define: {
      'process.env': 'process.env'
    }
  }
}
```

**Note**: If you want to use these configurations in an existing project, please see the Vite plugin [vite-plugin-electron-config](https://github.com/alex8088/vite-plugin-electron-config)

### Config FAQs

#### How do I configure when the Electron app has multiple windows?

When your electron app has multiple windows, it means there are multiple html files or preload files. You can modify your config file like this:

```js
export default {
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          browser: resolve(__dirname, 'src/preload/browser.ts'),
          webview: resolve(__dirname, 'src/preload/webview.ts')
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          browser: resolve(__dirname, 'src/renderer/browser.html'),
          webview: resolve(__dirname, 'src/renderer/webview.html')
        }
      }
    }
  }
}
```

## CLI options

For the full list of CLI options, you can run `npx electron-vite -h` in your project. The flags listed below are only available via the command line interface:

- `--ignoreConfigWarning`: boolean, allow you ignore warning when config missing
- `--outDir`: string, output directory (default: out)

## API

### build

Type Signature:

```js
async function build(inlineConfig: InlineConfig = {}): Promise<void>
```

Example Usage:

```js
const path = require('path')
const { build } = require('electron-vite')

;(async () => {
  await build({
    build: {
      outDir: 'out'
      rollupOptions: {
        // ...
      }
    }
  })
})()
```

### createServer

Type Signature:

```js
async function createServer(inlineConfig: InlineConfig = {}): Promise<void>
```

Example Usage:

```js
const { createServer } = require('electron-vite')

;(async () => {
  await createServer({
    server: {
      port: 1337
    }
  })
})()
```

### preview

Type Signature:

```js
async function preview(inlineConfig: InlineConfig = {}): Promise<void>
```

Example Usage:

```js
const { preview } = require('electron-vite')

;(async () => {
  await preview({})
})()
```

### InlineConfig

The InlineConfig interface extends Vite [UserConfig](https://vitejs.dev/guide/api-javascript.html#inlineconfig) with additional properties:

- `ignoreConfigWarning`: set to `false` to ignore warning when config missing

And omit `base` property because it is not necessary to set the base public path in Electron.

### resolveConfig

Type Signature:

```js
async function resolveConfig(
  inlineConfig: InlineConfig,
  command: 'build' | 'serve',
  defaultMode = 'development'
): Promise<ResolvedConfig>
```

## License

[MIT](./LICENSE) © alex.wei
