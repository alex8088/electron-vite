// node worker
declare module '*?nodeWorker' {
  import { Worker, WorkerOptions } from 'node:worker_threads'
  export default function (options: WorkerOptions): Worker
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
