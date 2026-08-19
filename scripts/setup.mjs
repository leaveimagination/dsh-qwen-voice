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

const profile = process.env.DSH_PROFILE || 'web'
const tools = path.join(root, 'tools', 'dsh-qwen-coordinator-tools')

run(process.execPath, ['scripts/patch-qwen-audio-agent.mjs'])
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install'], path.join(root, 'bridge'))
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['typecheck'])
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'])
// The coordinator tools plugin lives in this repository under tools/ and is
// required for coordinator-only session operations.
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install'], tools)
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--dir', tools, 'typecheck'])
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--dir', tools, 'build'])
// dsh plugin add auto-creates the profile if it does not exist yet, so a
// fresh machine only needs DeepSeek Harness Web installed (see README).
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '-p',
  '@deepseek-ai/dsh@0.1.0-rc.6',
  'dsh',
  'plugin',
  '--profile',
  profile,
  'add',
  root,
])
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '-p',
  '@deepseek-ai/dsh@0.1.0-rc.6',
  'dsh',
  'plugin',
  '--profile',
  profile,
  'add',
  tools,
])

console.log('\nSetup complete. Start with: pnpm start')
