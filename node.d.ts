// node worker
declare module '*?nodeWorker' {
  import { Worker, WorkerOptions } from 'node:worker_threads'
  export default function (options: WorkerOptions): Worker
}

// module path
declare module '*?modulePath' {
  const src: string
  export default src
}

// node asset
declare module '*?asset' {
  const src: string
  export default src
}

declare module '*?asset&asarUnpack' {
  const src: string
  export default src
}

declare module '*.json?commonjs-external&asset' {
  const src: string
  export default src
}

// native node module
declare module '*.node' {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const node: any
  export default node
}

// node wasm
declare module '*.wasm?loader' {
  const loadWasm: (options?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
  export default loadWasm
}

// build-in process env
declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * Vite's dev server address for Electron renderers.
     */
    readonly ELECTRON_RENDERER_URL?: string
  }
}

// Refer to Vite's ImportMeta type declarations
// <https://github.com/vitejs/vite/blob/main/packages/vite/types/importMeta.d.ts>

interface ImportMetaEnv {
  MODE: string
  DEV: boolean
  PROD: boolean
}

interface ImportGlobOptions<Eager extends boolean, AsType extends string> {
  /**
   * Import type for the import url.
   */
  as?: AsType
  /**
   * Import as static or dynamic
   *
   * @default false
   */
  eager?: Eager
  /**
   * Import only the specific named export. Set to `default` to import the default export.
   */
  import?: string
  /**
   * Custom queries
   */
  query?: string | Record<string, string | number | boolean>
  /**
   * Search files also inside `node_modules/` and hidden directories (e.g. `.git/`). This might have impact on performance.
   *
   * @default false
   */
  exhaustive?: boolean
}

interface KnownAsTypeMap {
  raw: string
  url: string
  worker: Worker
}

interface ImportGlobFunction {
  /**
   * Import a list of files with a glob pattern.
   *
   * https://vitejs.dev/guide/features.html#glob-import
   */
  <Eager extends boolean, As extends string, T = As extends keyof KnownAsTypeMap ? KnownAsTypeMap[As] : unknown>(
    glob: string | string[],
    options?: ImportGlobOptions<Eager, As>
  ): (Eager extends true ? true : false) extends true ? Record<string, T> : Record<string, () => Promise<T>>
  <M>(glob: string | string[], options?: ImportGlobOptions<false, string>): Record<string, () => Promise<M>>
  <M>(glob: string | string[], options: ImportGlobOptions<true, string>): Record<string, M>
}

interface ImportMeta {
  url: string
  readonly env: ImportMetaEnv
  glob: ImportGlobFunction
}
