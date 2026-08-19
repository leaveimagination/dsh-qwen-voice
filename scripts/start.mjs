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

// DSH instances the voice bridge can attach to, in probe order. The standalone
// DSH Web build listens on 3080 by default while DeepSeek Harness Desktop
// embeds its own DSH kernel on 4975. Probing 4975 first keeps desktop users
// working out of the box; web-only setups simply fall back to 3080.
const DSH_PROBE_PORTS = [4975, 3080]

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

// Probe every candidate DSH instance and return the reachable base URLs. Every
// reachable origin is added to the Gateway allow-list so the floating orb works
// regardless of which front-end page (web 3080 or Desktop 4975) loaded it.
async function detectDshInstances() {
  const reachable = []
  for (const port of DSH_PROBE_PORTS) {
    const baseUrl = `http://127.0.0.1:${port}`
    if (await isDshInstanceAlive(baseUrl)) reachable.push(baseUrl)
  }
  return reachable
}

const dshInstances = await detectDshInstances()
const bridgeUrl = process.env.DSH_WEB_URL || dshInstances[0] || 'http://127.0.0.1:3080'
const mergedOrigins = [
  ...String(process.env.QWEN_AUDIO_AGENT_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  ...dshInstances.map(url => new URL(url).origin),
]
const allowedOrigins = [...new Set(mergedOrigins)].join(',')

if (process.env.DSH_WEB_URL) {
  console.log(`[dsh-qwen-voice] DSH_WEB_URL set explicitly: ${bridgeUrl}`)
} else if (dshInstances.length > 0) {
  console.log(`[dsh-qwen-voice] detected DSH instance: ${bridgeUrl} (reachable: ${dshInstances.join(', ')})`)
} else {
  console.log(`[dsh-qwen-voice] no DSH instance detected, defaulting to ${bridgeUrl}`)
}
console.log(`[dsh-qwen-voice] Gateway allowed origins: ${allowedOrigins || '(none)'}`)

const env = {
  ...process.env,
  AGENT_PROTOCOL: process.env.AGENT_PROTOCOL || 'acp',
  ACP_COMMAND: process.env.ACP_COMMAND || process.execPath,
  ACP_ARGS: process.env.ACP_ARGS || path.join(root, 'bridge', 'src', 'index.mjs'),
  ACP_LABEL: process.env.ACP_LABEL || 'DSH Desktop',
  ACP_WORKSPACE: process.env.ACP_WORKSPACE || process.cwd(),
  DSH_WEB_URL: bridgeUrl,
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
