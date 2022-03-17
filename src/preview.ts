import { spawn } from 'child_process'
import colors from 'picocolors'
import { createLogger } from 'vite'
import { InlineConfig } from './config'
import { ensureElectronEntryFile, getElectronPath } from './utils'
import { build } from './build'

export async function preview(inlineConfig: InlineConfig = {}): Promise<void> {
  await build(inlineConfig)

  const logger = createLogger(inlineConfig.logLevel)

  ensureElectronEntryFile(inlineConfig.root)

  const electronPath = getElectronPath()

  const ps = spawn(electronPath, ['.'])
  ps.stdout.on('data', chunk => {
    chunk.toString().trim() && logger.info(chunk.toString())
  })
  ps.stderr.on('data', chunk => {
    chunk.toString().trim() && logger.error(chunk.toString())
  })
  ps.on('close', process.exit)

  logger.info(colors.green(`\nstart electron app...`))
}
