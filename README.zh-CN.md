# electron-vite

<p>
  <img src="https://img.shields.io/badge/node->14.0.0-blue.svg" alt="node" />
  <img src="https://img.shields.io/badge/vite->2.6.0-747bff.svg" alt="vite" />
</p>

[English](./README.md) | 简体中文

> 新一代 Electron 开发构建工具

---

## 特性

- ⚡️使用方式与 [Vite](https://vitejs.dev) 相同
- 🔨主进程/渲染进程/ preload 脚本都使用 Vite 构建
- 📃统一所有配置，合并到一个文件中
- 📦预设构建配置，无需关注配置
- 🚀支持渲染进程热更新(HMR)

## 用法

### 安装

```sh
npm i electron-vite -D
```

### 开发 & 编译

在安装了 `electron-vite` 的项目中，可以直接使用 `npx electron-vite` 运行， 也可以在 `package.json` 文件中添加 npm scripts ：

```json
{
  "scripts": {
    "start": "electron-vite preview", // 开启 Electron 预览生产构建
    "dev": "electron-vite dev", // 开启开发服务并启动 Electron 程序
    "prebuild": "electron-vite build" // 为生产打包构建
  }
}
```

为了使用热更新(HMR)，需要使用环境变量（`ELECTRON_RENDERER_URL`）来决定 Electron 窗口加载本地页面还是远程页面。

```js
function createWindow() {
  // 创建窗口
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  // 开发模式下使用支持HMR的远程地址，生产模式下使用本地html页面
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}
```

**注意**：在开发中，渲染进程 `index.html` 文件需要通过 `<script type="module">` 引用脚本。

### 推荐项目目录

```shell
├──src
|  ├──main
|  |  ├──index.js
|  |  └──...
|  ├──preload
|  |  ├──index.js
|  |  └──...
|  └──renderer
|     ├──src
|     ├──index.html
|     └──...
├──electron.vite.config.js
└──package.json
```

### 开始学习

克隆 [electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) 模板或者使用 [create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron) 脚手架来搭建项目学习。

``` bash
npm init @quick-start/electron
```

## 配置

### 配置文件

当以命令行方式运行 `electron-vite` 时，将会自动尝试解析项目根目录中名为 `electron.vite.config.js` 的配置文件。最基本的配置文件如下所示：

```js
// electron.vite.config.js
export default {
  main: {
    // vite 配置选项
  },
  preload: {
    // vite 配置选项
  },
  renderer: {
    // vite 配置选项
  }
}
```

你可以显式地通过 `--config` 命令行选项指定一个配置文件（相对于 `cwd` 路径进行解析）：

```sh
electron-vite --config my-config.js
```

**提示**：`electron-vite` 也支持 `ts` 或者 `mjs` 的配置文件。

### 配置智能提示

因为 `electron-vite` 本身附带 Typescript 类型，所以你可以通过 IDE 和 jsdoc 的配合来实现智能提示：

```js
/**
 * @type {import('electron-vite').UserConfig}
 */
const config = {
  // ...
}

export default config
```

你还可以使用 `defineConfig` and `defineViteConfig` 工具函数，这样不用 jsdoc 注解也可以获取类型提示：

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
    // 条件配置可使用 defineViteConfig
    // ...
  })
})
```

**提示**：`defineViteConfig` 从 `Vite` 中导出。

### 配置参考

见 [vitejs.dev](https://vitejs.dev/config)

### 配置预设

#### `主进程`编译项预设：

- **outDir**：`out\main`（相对于根目录）
- **target**：`node*`，自动匹配 `Electron` 的 `node` 构建目标，如 Electron 17 为 `node16.13`
- **lib.entry**：`src\main\{index|main}.{js|ts|mjs|cjs}`（相对于根目录），找不到则为空
- **lib.formats**：`cjs`
- **rollupOptions.external**：`electron` 和所有内置 node 模块(如果用户配置了外部模块ID，将自动合并)

#### `preload` 脚本编译项预设：

- **outDir**：`out\preload`（相对于根目录）
- **target**：同`主进程`
- **lib.entry**：`src\preload\{index|preload}.{js|ts|mjs|cjs}`（相对于根目录），找不到则为空
- **lib.formats**：`cjs`
- **rollupOptions.external**：同`主进程`

#### `渲染进程`编译项预设：

- **root**：`src\renderer`（相对于根目录）
- **outDir**：`out\renderer`（相对于根目录）
- **target**：`chrome*`, 自动匹配 `Electron` 的 `chrome` 构建目标，如 Electron 17 为 `chrome98`
- **lib.entry**：`src\renderer\index.html`（相对于根目录），找不到则为空
- **polyfillModulePreload**：`false`，不需要为渲染进程 polyfill `Module Preload`
- **rollupOptions.external**：同`主进程`

#### `主进程`和 `preload` 脚本的 `define` 项设置：

在 Web 开发中，Vite 会将 `'process.env.'` 替换为 `'({}).'`，这是合理和正确的。但在 nodejs 开发中，我们有时候需要使用 `process.env` ，所以 `electron-vite` 重新预设全局变量替换，恢复其使用，预设如下：

```js
export default {
  main: {
    define: {
      'process.env': 'process.env'
    }
  }
}
```

**提示**：如果你想在已有的项目中使用这些预设配置，可以使用 Vite 的插件 [vite-plugin-electron-config](https://github.com/alex8088/vite-plugin-electron-config)

### 配置问题

#### 如果 Electron 具有多窗口应该如何配置？

当 Electron 应用程序具有多窗口时，就意味着可能有多个 html 页面和 preload 脚本，你可以像下面一样修改你的配置文件：

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

## 命令行选项

在项目中，可运行 `npx electron-vite -h` 获得完整的命令行选项列表。下面列出的标志只能通过命令行使用：

- `--ignoreConfigWarning`：boolean，忽略配置缺失警告（如配置文件中移除 preload 配置，不使用 preload 开发时，是有用的）
- `--outDir`：string，输出路径，相对根目录 (默认：out)

## API

### build

类型：

```js
async function build(inlineConfig: InlineConfig = {}): Promise<void>
```

示例：

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

类型：

```js
async function createServer(inlineConfig: InlineConfig = {}): Promise<void>
```

示例：

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

类型：

```js
async function preview(inlineConfig: InlineConfig = {}): Promise<void>
```

示例：

```js
const { preview } = require('electron-vite')

;(async () => {
  await preview({})
})()
```

### InlineConfig

`InlineConfig` 接口扩展了 Vite [UserConfig](https://vitejs.dev/guide/api-javascript.html#inlineconfig) 并添加了以下属性：

- `ignoreConfigWarning`：设置为 `false` 来忽略配置缺失警告

同时移除 `base` 属性，因为在 Electron 中没有必要指定公共基础路径。

### resolveConfig

类型：

```js
async function resolveConfig(
  inlineConfig: InlineConfig,
  command: 'build' | 'serve',
  defaultMode = 'development'
): Promise<ResolvedConfig>
```

## License

[MIT](./LICENSE) @alex.wei