### v1.0.18 (_2023-01-16_)

- feat(asset): support for WebAssembly in the main process
- fix(asset): wasm must be suffixed with `?loader`

### v1.0.17 (_2023-01-08_)

- feat: static asset handling
- fix: output duplicate log in vscode debugging [#75](https://github.com/alex8088/electron-vite/issues/75)
- chore(bytecodePlugin): KiB to kB
- chore(worker): use toRelativePath helper
- chore(deps): update all non-major dependencies
- chore(deps): update vite to 4.0.4

### v1.0.16 (_2022-12-12_)

- feat: vite 4.x support [#69](https://github.com/alex8088/electron-vite/issues/69)
- fix: `NODE_ENV` is incorrect in vite 4.x [#70](https://github.com/alex8088/electron-vite/issues/70)
- fix: invalid output format check
- fix: output format check
- chore(deps): update all non-major dependencies
- chore(deps): update esbuild and magic-string
- chore(deps): update vite to 4.0.0

### v1.0.15 (_2022-12-05_)

- feat: support mode and command conditional config
- feat: specify env prefixes for vite's loadEnv and export it
- perf: build compatilibity target for Electron 22
- perf: do not externalize node builtin modules for the renderer [#61](https://github.com/alex8088/electron-vite/issues/61)

### v1.0.14 (_2022-11-13_)

- fix(bytecodePlugin): replace bytecode module regex

### v1.0.13 (_2022-11-11_)

- feat: support for node worker
- refactor: plugins
- fix(swcPlugin): unreachable code
- fix(bytecodePlugin): bytecode loader injection and chunk module parsing errors [#49](https://github.com/alex8088/electron-vite/issues/49)
- fix: incorrect replace `__dirname`/`__filename` in config file
- fix: output format error under multiple entries

### v1.0.12 (_2022-11-02_)

- feat: support monorepo (by @ianstormtaylor)
- feat: add `--skipBuild` flag to preview command
- feat: make a SWC plugin to support TypeScript decorators (`emitDecoratorMetadata`)
- fix: use `modulePreload.polyfill` instead `polyfillModulePreload`
- chore: update deps

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
