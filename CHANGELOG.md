### v2.1.0 (_2024-03-03_)

- feat: feat: easy way to fork processes and use workers
- fix: config via build.lib fails when default entry point not found ([#393](https://github.com/alex8088/electron-vite/issues/393))
- perf: build compatilibity target for Electron 29
- perf: allow integrating more complex render solutions ([#412](https://github.com/alex8088/electron-vite/pull/412))
- perf(bytecodePlugin): warn that strings cannot be protected when minification is enabled ([#417](https://github.com/alex8088/electron-vite/issues/417))

### v2.0.0 (_2024-01-09_)

- feat: bump minimum node version to 18
- feat: migrate to ESM
- feat: support vite 5
- feat: add package.json to export map
- feat: support ESM in Electron
- feat: env variables prefixed with VITE\_ will be shared in main process and renderer
- feat: support for passing arguments to electron in dev and preview commands ([#339](https://github.com/alex8088/electron-vite/pull/339))
- feat: config file supports "type": "module" in package.json
- fix: emit assets when ssr is enabled
- fix: externalizeDepPlugin not work
- fix: electron's export subpaths also need to be externalized ([#372](https://github.com/alex8088/electron-vite/issues/372))
- perf: improve package.json resolve
- perf: use magic-string hires boundary for sourcemaps
- perf: build compatilibity target for Electron 28
- pref: resolve import meta url in CommonJS format
- perf(worker): ESM syntax
- perf: package version
- perf: dev error message
- perf(externalizeDepsPlugin): use cached package data to improve performance
- perf: loadEnv api also needs to load shared env variables prefixed with VITE\_
- refactor: build
- refactor: file hashes use url-safe base64 encoded hashes in vite 5 (rollup 4)
- refactor: remove Electron 11, 12 build compatilibity target
- refactor: use dynamic import directly
- build: use rollup-plugin-dts
- chore(deps): update all non-major dependencies
- chore(deps): update lint-staged to v15
- chore(deps): update eslint-config-prettier to v9
- chore(deps): update @rollup/plugin-typescript to v11
- chore(deps): update rollup to v4
- chore(deps): update vite to v5
- chore(deps): update esbuild to v0.19
- chore(deps): update typescript to 5.3.3
- chore: improve prettier config
- chore: update homepage

### v2.0.0-beta.4 (_2024-01-06_)

See [v2.0.0-beta.4 changelog](https://github.com/alex8088/electron-vite/blob/v2.0.0-beta.4/CHANGELOG.md)

### v2.0.0-beta.3 (_2024-01-04_)

See [v2.0.0-beta.3 changelog](https://github.com/alex8088/electron-vite/blob/v2.0.0-beta.3/CHANGELOG.md)

### v2.0.0-beta.2 (_2023-12-19_)

See [v2.0.0-beta.2 changelog](https://github.com/alex8088/electron-vite/blob/v2.0.0-beta.2/CHANGELOG.md)

### v2.0.0-beta.1 (_2023-12-14_)

See [v2.0.0-beta.1 changelog](https://github.com/alex8088/electron-vite/blob/v2.0.0-beta.1/CHANGELOG.md)

### v2.0.0-beta.0 (_2023-12-13_)

See [v2.0.0-beta.0 changelog](https://github.com/alex8088/electron-vite/blob/v2.0.0-beta.0/CHANGELOG.md)

### v1.0.29 (_2023-11-17_)

- feat(cli): support --noSandbox option for dev and preview command
- perf: build compatilibity target for Electron 27

### v1.0.28 (_2023-09-18_)

- feat(cli): supports specifying electron entry file ([#270](https://github.com/alex8088/electron-vite/issues/270))
- fix(externalizeDepsPlugin): supports subpath
- perf: build compatilibity target for Electron 26
- chore(types): add .json?commonjs-external&asset typing

### v1.0.27 (_2023-08-01_)

- chore: remove preinstall script

### v1.0.26 (_2023-07-30_)

- feat(cli): add CLI `--inspect[-brk]` to support debugging without IDEs ([#231](https://github.com/alex8088/electron-vite/issues/231))
- feat(types): add process.env.ELECTRON_RENDERER_URL type
- feat(types): add Vite importMeta types
- perf: spawn Electron process using parent's stdios ([#236](https://github.com/alex8088/electron-vite/issues/236))
- chore: update user config interface jsdoc
- chore(deps): update pnpm to v8
- chore(deps): update prettier to v3
- chore(deps): update @typescript-eslint/\* to v6

### v1.0.25 (_2023-07-11_)

- fix: remove node resolve condition for preload [#204](https://github.com/alex8088/electron-vite/issues/204)
- fix(asset): asset handling error when hot reloading
- chore(deps): update all non-major dependencies
- chore(deps): update fs-extra to v11
- chore(deps): update @types/node to v18
- chore(deps): update typescript to 5.0.4
- chore(deps): update vite to 4.4.2
- chore(deps): update esbuild to v0.18
- chore(deps): update rollup to 3.26.2

### v1.0.24 (_2023-06-25_)

- fix(bytecodePlugin): bytecode loader relative path is incorrect
- perf: ignore `browser` field and additional `node` condition for main config

### v1.0.23 (_2023-06-04_)

- feat: supports ES build target for renderer [#174](https://github.com/alex8088/electron-vite/issues/174)
- revert: chore: remove process env define [#159](https://github.com/alex8088/electron-vite/issues/174)
- perf: build compatilibity target for Electron 25
- chore(deps): update all non-major dependencies

### v1.0.22 (_2023-04-23_)

- feat(cli): add --rendererOnly flag to dev command
- perf: build compatilibity target for Electron 24
- chore: remove process env define
- chore: typo error messages

### v1.0.21 (_2023-03-27_)

- fix(bytecodePlugin): bytecode loader is not referenced correctly in the chunks
- fix(bytecodePlugin): sub-chunks are not compliled in vite 4
- perf: always disable build.modulePreload in main and preload config
- chore(deps): update esbuild to 0.17
- chore(deps): update vite to 4.2.1

### v1.0.20 (_2023-03-12_)

- feat: support for renderer debugging [#130](https://github.com/alex8088/electron-vite/issues/130)
- fix(asset): asset path is not resolved correctly when outDir is specified [#117](https://github.com/alex8088/electron-vite/issues/117)
- fix: specified renderer outDir is not parsed correctly
- fix(bytecodePlugin): not work in monorepo [#128](https://github.com/alex8088/electron-vite/issues/128)
- perf: build compatilibity target for Electron 23
- perf: print log
- chore(deps): update all non-major dependencies
- chore(deps): update vite to 4.1.4
- chore(deps): update rollup to 3.18
- chore(deps): update magic-string to 0.30.0

### v1.0.19 (_2023-02-06_)

- feat(bytecodePlugin): protect strings [#91](https://github.com/alex8088/electron-vite/issues/91)
- fix(bytecodePlugin): escape protected strings (thanks to [@jeremyben](https://github.com/jeremyben))

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
