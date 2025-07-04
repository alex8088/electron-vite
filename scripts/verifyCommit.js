// Invoked on the commit-msg git hook by simple-git-hooks.

import colors from 'picocolors'
import fs from 'node:fs'

const msgPath = process.argv[2]
const msg = fs.readFileSync(msgPath, 'utf-8').trim()

const commitRE =
  /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\(.+\))?!?: .{1,50}/

if (!commitRE.test(msg)) {
  console.log()
  console.error(
    `  ${colors.bgRed(colors.white(' ERROR '))} ${colors.red(`invalid commit message format.`)}\n\n` +
      colors.red(`  Proper commit message format is required for automated changelog generation. Examples:\n\n`) +
      `    ${colors.green(`feat: add 'comments' option`)}\n` +
      `    ${colors.green(`fix: handle events on blur (close #28)`)}\n\n` +
      colors.red(`  See .github/commit-convention.md for more details.\n`)
  )
  process.exit(1)
}
