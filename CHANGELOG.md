### v1.0.11 (_2022-10-16_)

- feat: externalize deps plugin

### v1.0.10 (_2022-10-07_)

- feat: export splitVendorChunk from vite
- fix: compatible with the latest version of Electron
- refactor: load config file
- perf: the bytecodePlugin transform arrow function by default
- perf: disable gzip-compressed size reporting, increase build performance
- perf: bytecode compilation log print format
- perf: build compatilibity target for Electron 21

### v1.0.9 (_2022-09-19_)

- feat: source code protection
- fix: specify a config file error
- fix: in the specified non-production mode, the `base` path is wrong
- perf: cache electron executable path
- chore: add electron-vite mode node env
- chore: use node prefix

### v1.0.8 (_2022-09-11_)

- feat: the main process and preload scripts support hot reloading [#7](https://github.com/alex8088/electron-vite/issues/7)

### v1.0.7 (_2022-08-29_)

- feat: add sourcemap cli options for debugging

### v1.0.6 (_2022-08-25_)

- chore: update deps
- chore: use vite@3

### v1.0.5 (_2022-08-20_)

- fix: can not get import meta env variables in renderer
- feat: define env prefix
- feat: new official website released

### v1.0.4 (_2022-07-03_)

- fix: error occurs when the preload config is a function (by @Beiluola)
- fix: ELECTRON_RENDERER_URL is incorrect when host is true (by @Beiluola)
- feat: add sqlite3 module to rollup external option

### v1.0.3 (_2022-05-01_)

- fix: throw error when vite.config.\* file in root ([#3](https://github.com/alex8088/electron-vite/issues/3))
- feat: export splitVendorChunkPlugin from vite
- perf: build target for Electron 19

### v1.0.2 (_2022-03-31_)

#### Bug fixes

- fix: an error occurred when `tsconfig` file changed

### v1.0.1 (_2022-03-28_)

#### Prefs

- perf: no need to polyfill `Module Preload` for the Electron renderer ([82477b](https://github.com/alex8088/electron-vite/commit/82477b))

### v1.0.0 (_2022-03-17_)

#### Features

- electron-vite
