#!/usr/bin/env node

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const qwenCli = path.join(
  root,
  'node_modules',
  'qwen-audio-agent',
  'cli',
  'bin',
  'qwenaudio.mjs',
)

const env = {
  ...process.env,
  AGENT_PROTOCOL: process.env.AGENT_PROTOCOL || 'acp',
  ACP_COMMAND: process.env.ACP_COMMAND || process.execPath,
  ACP_ARGS: process.env.ACP_ARGS || path.join(root, 'bridge', 'src', 'index.mjs'),
  ACP_LABEL: process.env.ACP_LABEL || 'DSH Web',
  ACP_WORKSPACE: process.env.ACP_WORKSPACE || process.cwd(),
  DSH_WEB_URL: process.env.DSH_WEB_URL || 'http://127.0.0.1:3080',
  QWEN_AUDIO_AGENT_ALLOWED_ORIGINS:
    process.env.QWEN_AUDIO_AGENT_ALLOWED_ORIGINS || 'http://127.0.0.1:3080',
  QWEN_AUDIO_AGENT_TASK_MAX_CONCURRENT:
    process.env.QWEN_AUDIO_AGENT_TASK_MAX_CONCURRENT || '8',
  QWEN_AUDIO_AGENT_TASK_MAX_CONCURRENT_PER_OWNER:
    process.env.QWEN_AUDIO_AGENT_TASK_MAX_CONCURRENT_PER_OWNER || '4',
  QWEN_AUDIO_AGENT_ANNOUNCEMENT_BATCH_MS:
    process.env.QWEN_AUDIO_AGENT_ANNOUNCEMENT_BATCH_MS || '0',
  QWEN_AUDIO_AGENT_ANNOUNCEMENT_MAX_BATCH_ITEMS:
    process.env.QWEN_AUDIO_AGENT_ANNOUNCEMENT_MAX_BATCH_ITEMS || '1',
}

const args = process.argv.slice(2)

const child = spawn(process.execPath, [qwenCli, ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
})

child.on('error', error => {
  console.error(`Unable to start bundled Qwen Audio Agent: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', code => {
  process.exitCode = code ?? 1
})
