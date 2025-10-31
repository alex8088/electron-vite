import { type Plugin } from 'vite'

type BuildReporterApi = {
  getWatchFiles: () => string[]
}

export default function buildReporterPlugin(): Plugin<BuildReporterApi> {
  const moduleIds: string[] = []
  return {
    name: 'vite:build-reporter',

    buildEnd() {
      const allModuleIds = Array.from(this.getModuleIds())
      const sourceFiles = allModuleIds.filter(id => {
        if (id.includes('node_modules')) {
          return false
        }
        const info = this.getModuleInfo(id)
        return info && !info.isExternal
      })
      moduleIds.push(...sourceFiles)
    },

    api: {
      getWatchFiles() {
        return moduleIds
      }
    }
  }
}
