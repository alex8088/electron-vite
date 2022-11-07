// node worker
declare module '*?nodeWorker' {
  import { Worker, WorkerOptions } from 'node:worker_threads'
  export default function (options: WorkerOptions): Worker
}
