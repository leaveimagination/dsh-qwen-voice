import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('Qwen patch installs structured task routing instead of keyword guessing', () => {
  const patcher = fs.readFileSync(
    path.join(root, 'scripts', 'patch-qwen-audio-agent.mjs'),
    'utf8',
  )
  assert.match(patcher, /'new_task', 'continue_task', 'modify_active_task'/)
  assert.match(patcher, /requestedRouting === 'modify_active_task' \? 'steer' : 'queue'/)
  assert.match(patcher, /'ambiguous_task_target'/)
  assert.doesNotMatch(patcher, /includes\(['"]继续['"]\)/)
})

test('installed coordinator envelope carries the authoritative delivery mode', () => {
  const coordinator = fs.readFileSync(
    path.join(root, 'node_modules', 'qwen-audio-agent', 'server', 'src', 'agent', 'coordinator.mjs'),
    'utf8',
  )
  assert.match(coordinator, /routing: \{/)
  assert.match(coordinator, /delivery: routing\.delivery === 'steer' \? 'steer' : 'queue'/)
})

test('active-task modification steers the real target without creating another work', () => {
  const handler = fs.readFileSync(
    path.join(root, 'node_modules', 'qwen-audio-agent', 'server', 'src', 'voice', 'tools', 'tool-call-handler.mjs'),
    'utf8',
  )
  const adapter = fs.readFileSync(
    path.join(root, 'node_modules', 'qwen-audio-agent', 'server', 'src', 'agent', 'acp-backend-adapter.mjs'),
    'utf8',
  )
  const redirectAt = handler.indexOf("if (requestedRouting === 'modify_active_task')")
  const createAt = handler.indexOf('task = this.createWork({', redirectAt)
  const directAt = handler.indexOf('this.coordinator.redirectDelegatedWork(', redirectAt)
  assert.ok(redirectAt >= 0 && directAt > redirectAt && directAt < createAt)
  assert.match(handler.slice(directAt, createAt), /return/)
  assert.match(adapter, /method: 'session\.prompt'/)
  assert.match(adapter, /mode: 'steer'/)
  assert.match(adapter, /content: \[\{ type: 'text', text: clean\(instruction\) \}\]/)
})

test('runtime binds to one explicit DSH Web origin and never probes Desktop', () => {
  const startScript = fs.readFileSync(
    path.join(root, 'scripts', 'start.mjs'),
    'utf8',
  )
  assert.match(startScript, /DEFAULT_DSH_WEB_URL = 'http:\/\/127\.0\.0\.1:3080'/)
  assert.doesNotMatch(startScript, /4975|DSH_PROBE_PORTS|detectDshInstances/)
  assert.match(startScript, /const bridgeUrl = DEFAULT_DSH_WEB_URL/)
  assert.match(startScript, /DeepSeek Harness Web is not reachable/)
  assert.match(startScript, /ACP_LABEL: process\.env\.ACP_LABEL \|\| 'DSH Web'/)
  assert.match(startScript, /DSH_WEB_URL: parsedBridgeUrl\.origin/)
})
