#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sessionId = String(process.argv[2] || '').trim()
const cwd = path.resolve(String(process.argv[3] || process.cwd()).trim())

if (!/^session-[0-9a-f-]{36}$/i.test(sessionId)) {
  throw new Error('Usage: pnpm rebind-coordinator <session-id> [workspace-cwd]')
}
if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Workspace directory does not exist: ${cwd}`)
}

const configRoot = process.env.QWAUDIO_CONFIG_DIR
  ? path.resolve(process.env.QWAUDIO_CONFIG_DIR)
  : path.join(os.homedir(), '.config', 'qwaudio')
const bindingPath = path.join(configRoot, 'dsh-coordinator.json')
const registryPath = path.join(configRoot, 'state', 'acp-sessions.json')
const now = Date.now()
const binding = { version: 1, sessionId, cwd, updatedAt: now }

let registry = { version: 1, coordinators: {}, projects: {} }
if (fs.existsSync(registryPath)) {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
}
registry.version = 1
registry.coordinators ||= {}
registry.projects ||= {}
registry.coordinators['acp:user_personal:backend'] = {
  sessionId,
  cwd,
  updatedAt: now,
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

// Write the registry first. Until the binding is committed, the plugin keeps
// enforcing the previous Coordinator instead of observing a half-written pair.
atomicWrite(registryPath, registry)
atomicWrite(bindingPath, binding)

console.log(JSON.stringify({
  status: 'rebound',
  sessionId,
  cwd,
  bindingPath,
  registryPath,
  restartRequired: true,
}, null, 2))
