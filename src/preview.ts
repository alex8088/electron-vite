import colors from 'picocolors'
import { createLogger } from 'vite'
import type { InlineConfig } from './config'
import { startElectron } from './electron'
import { build } from './build'

export async function preview(inlineConfig: InlineConfig = {}): Promise<void> {
  await build(inlineConfig)

  const logger = createLogger(inlineConfig.logLevel)

  startElectron(inlineConfig.root, logger)

  logger.info(colors.green(`\nstart electron app...`))
}
