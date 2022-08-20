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
