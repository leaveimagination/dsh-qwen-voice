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

// Bind the complete voice stack to one DSH origin. Never probe another DSH
// instance: running Web and Desktop together must not split session ownership.
const DEFAULT_DSH_WEB_URL = 'http://127.0.0.1:3080'

async function isDshInstanceAlive(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/session.list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `dsh-voice-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        method: 'session.list',
        payload: { limit: 1 },
      }),
      signal: AbortSignal.timeout(1500),
    })
    return response.ok
  } catch {
    return false
  }
}

const bridgeUrl = DEFAULT_DSH_WEB_URL
const parsedBridgeUrl = new URL(bridgeUrl)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedBridgeUrl.hostname)) {
  throw new Error(`DSH_WEB_URL must be a loopback URL, got ${parsedBridgeUrl.hostname}`)
}
const dshAlive = await isDshInstanceAlive(parsedBridgeUrl.origin)
if (!dshAlive) {
  throw new Error([
    `DeepSeek Harness Web is not reachable at ${parsedBridgeUrl.origin}.`,
    'Start DSH Web first, confirm the page opens, then run pnpm start again.',
  ].join(' '))
}
const mergedOrigins = [
  ...String(process.env.QWEN_AUDIO_AGENT_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  parsedBridgeUrl.origin,
]
const allowedOrigins = [...new Set(mergedOrigins)].join(',')

console.log(`[dsh-qwen-voice] fixed DSH Web instance: ${parsedBridgeUrl.origin} (${dshAlive ? 'reachable' : 'not reachable'})`)
console.log(`[dsh-qwen-voice] Gateway allowed origins: ${allowedOrigins || '(none)'}`)

const env = {
  ...process.env,
  AGENT_PROTOCOL: process.env.AGENT_PROTOCOL || 'acp',
  ACP_COMMAND: process.env.ACP_COMMAND || process.execPath,
  ACP_ARGS: process.env.ACP_ARGS || path.join(root, 'bridge', 'src', 'index.mjs'),
  ACP_LABEL: process.env.ACP_LABEL || 'DSH Web',
  ACP_WORKSPACE: process.env.ACP_WORKSPACE || process.cwd(),
  DSH_WEB_URL: parsedBridgeUrl.origin,
  ...(allowedOrigins
    ? { QWEN_AUDIO_AGENT_ALLOWED_ORIGINS: allowedOrigins }
    : {}),
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
