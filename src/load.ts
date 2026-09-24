import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { rolldown } from 'rolldown'
import type { RolldownOutput, OutputChunk } from 'rolldown'

const CONFIG_FILE_NAME = 'electron.vite.config'

export function findConfigFile(
  configRoot: string,
  extensions: string[] = ['js', 'ts', 'mjs', 'cjs', 'mts', 'cts']
): string {
  for (const ext of extensions) {
    const configFile = path.resolve(configRoot, `${CONFIG_FILE_NAME}.${ext}`)
    if (fs.existsSync(configFile)) {
      return configFile
    }
  }
  return ''
}

export async function bundleConfigFile(
  fileName: string,
  isESM: boolean
): Promise<{ code: string; dependencies: string[] }> {
  const dirnameVarName = '__electron_vite_injected_dirname'
  const filenameVarName = '__electron_vite_injected_filename'
  const importMetaUrlVarName = '__electron_vite_injected_import_meta_url'

  const bundle = await rolldown({
    input: path.resolve(fileName),
    platform: 'node',
    transform: {
      target: 'node20',
      define: {
        __dirname: dirnameVarName,
        __filename: filenameVarName,
        'import.meta.url': importMetaUrlVarName
      }
    },
    plugins: [
      {
        name: 'externalize-deps',
        resolveId(id) {
          if (id[0] !== '.' && !path.isAbsolute(id)) {
            return { id, external: true }
          }
          return null
        }
      },
      {
        name: 'inject-file-scope-variables',
        transform: {
          filter: { id: /\.[cm]?[jt]s$/ },
          handler(code, id) {
            const injectValues =
              `const ${dirnameVarName} = ${JSON.stringify(path.dirname(id))};` +
              `const ${filenameVarName} = ${JSON.stringify(id)};` +
              `const ${importMetaUrlVarName} = ${JSON.stringify(pathToFileURL(id).href)};`
            return { code: injectValues + code, map: null }
          }
        }
      }
    ]
  })

  let result: RolldownOutput
  try {
    result = await bundle.generate({
      format: isESM ? 'esm' : 'cjs',
      sourcemap: 'inline',
      sourcemapPathTransform(relative, sourcemapPath) {
        return path.resolve(path.dirname(sourcemapPath), relative)
      },
      codeSplitting: false
    })
  } finally {
    await bundle.close()
  }

  const entryChunk = result.output.find((chunk): chunk is OutputChunk => chunk.type === 'chunk' && chunk.isEntry)
  if (!entryChunk) {
    throw new Error(`Failed to bundle config file: ${fileName}`)
  }

  return {
    code: entryChunk.code,
    dependencies: entryChunk.moduleIds.filter(id => !id.startsWith('\0'))
  }
}

interface NodeModuleWithCompile extends NodeModule {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  _compile(code: string, filename: string): any
}

const _require = createRequire(import.meta.url)

export async function loadConfigFormBundledFile<T>(fileName: string, bundledCode: string, isESM: boolean): Promise<T> {
  if (isESM) {
    const fileNameTmp = `${fileName}.${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
    fs.writeFileSync(fileNameTmp, bundledCode)

    const fileUrl = pathToFileURL(fileNameTmp)
    try {
      return (await import(fileUrl.href)).default
    } finally {
      try {
        fs.unlinkSync(fileNameTmp)
      } catch {}
    }
  } else {
    const extension = path.extname(fileName)
    const realFileName = fs.realpathSync(fileName)
    const loaderExt = extension in _require.extensions ? extension : '.js'
    const defaultLoader = _require.extensions[loaderExt]!
    _require.extensions[loaderExt] = (module: NodeModule, filename: string): void => {
      if (filename === realFileName) {
        ;(module as NodeModuleWithCompile)._compile(bundledCode, filename)
      } else {
        defaultLoader(module, filename)
      }
    }
    delete _require.cache[_require.resolve(fileName)]
    const raw = _require(fileName)
    _require.extensions[loaderExt] = defaultLoader
    return raw.__esModule ? raw.default : raw
  }
}
