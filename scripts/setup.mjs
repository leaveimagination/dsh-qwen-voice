#!/usr/bin/env node

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(process.execPath, ['scripts/patch-qwen-audio-agent.mjs'])
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install'], path.join(root, 'bridge'))
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['typecheck'])
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'])
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '-p',
  '@deepseek-ai/dsh@0.1.0-rc.6',
  'dsh',
  'plugin',
  '--profile',
  process.env.DSH_PROFILE || 'web',
  'add',
  root,
])

console.log('\nSetup complete. Start with: pnpm start')
