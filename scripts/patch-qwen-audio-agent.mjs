#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const globalRoot = execFileSync(npmCommand, ['root', '--global'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}).trim()
const root = path.join(globalRoot, 'qwen-audio-agent')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (pkg.version !== '1.10.0') {
  throw new Error(`Expected qwen-audio-agent 1.10.0, found ${pkg.version}.`)
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n')
}

function write(relative, source) {
  fs.writeFileSync(path.join(root, relative), source)
}

function replaceOnce(relative, from, to, marker, { optional = false } = {}) {
  const source = read(relative)
  if (source.includes(marker)) {
    console.log(`already patched: ${relative} (${marker})`)
    return
  }
  if (!source.includes(from)) {
    if (optional) {
      console.log(`not applicable: ${relative} (${marker})`)
      return
    }
    throw new Error(`Unexpected source in ${relative}; refusing to patch ${marker}.`)
  }
  write(relative, source.replace(from, to))
  console.log(`patched: ${relative} (${marker})`)
}

function replaceSection(relative, start, end, replacement, marker) {
  const source = read(relative)
  if (source.includes(marker)) {
    console.log(`already patched: ${relative} (${marker})`)
    return
  }
  const startAt = source.indexOf(start)
  const endAt = source.indexOf(end, startAt + start.length)
  if (startAt < 0 || endAt < 0) {
    throw new Error(`Unexpected source in ${relative}; refusing to patch ${marker}.`)
  }
  write(relative, source.slice(0, startAt) + replacement + source.slice(endAt))
  console.log(`patched: ${relative} (${marker})`)
}

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  'laneKey: `coordinator:${this.ownerId}`',
  'laneKey: `coordinator:${this.ownerId}:${this.sessionId}:${turnId}`',
  'laneKey: `coordinator:${this.ownerId}:${this.sessionId}:${turnId}`',
)

// Older local builds created one Coordinator per work item. Collapse that
// compatibility patch back to the upstream one-owner/one-Session model.
replaceOnce(
  'server/src/agent/coordinator.mjs',
  `const backendOwnerId = options.coordinationRunId
      ? \`${'${options.ownerId}'}::work::${'${options.coordinationRunId}'}\`
      : options.sessionId
        ? \`${'${options.ownerId}'}::voice::${'${options.sessionId}'}\`
        : options.ownerId
    const run = message => this.client.runCoordinator
      ? this.client.runCoordinator(message, {
          ownerId: backendOwnerId,`,
  `const run = message => this.client.runCoordinator
      ? this.client.runCoordinator(message, {
          // One durable Coordinator Session per authenticated owner.
          ownerId: options.ownerId,`,
  'One durable Coordinator Session per authenticated owner',
  { optional: true },
)

replaceOnce(
  'server/src/core/request-security.mjs',
  `if (configured.includes(origin)) {
    return originUrl.host === requestHost.host
  }`,
  `if (configured.includes(origin)) {
    // An exact administrator-supplied Origin is trusted across loopback ports.
    return true
  }`,
  'An exact administrator-supplied Origin',
)

replaceOnce(
  'server/src/app/bootstrap.mjs',
  `app.use(enforceSameOrigin)
app.use((req, res, next) => {`,
  `app.use(enforceSameOrigin)
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '')
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dsh-Qwen-Token')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
  }
  next()
})
app.use((req, res, next) => {`,
  "Access-Control-Allow-Headers', 'Content-Type, X-Dsh-Qwen-Token'",
)

replaceOnce(
  'server/src/task/task-manager.mjs',
  `delegation: task.delegation
      ? {
          status: task.delegation.status || 'running',`,
  `delegation: task.delegation
      ? {
          id: task.delegation.id || null,
          sessionId: task.delegation.sessionId || null,
          status: task.delegation.status || 'running',`,
  'id: task.delegation.id || null',
)

const agentClassMethods = `  listProjectSessions(input = {}) {
    return this.adapter.listProjectSessions(input)
  }

  runManagedProjectSession(action, input, options = {}) {
    return this.adapter.runManagedProjectSession(action, input, options)
  }

`
replaceOnce(
  'server/src/agent/agent-client.mjs',
  '  uiUrl(options = {}) {',
  `${agentClassMethods}  uiUrl(options = {}) {`,
  'runManagedProjectSession(action, input, options = {})',
)

const agentFacadeMethods = `  listProjectSessions: (input = {}) =>
    requireAgent().listProjectSessions(input),
  runManagedProjectSession: (action, input, options = {}) =>
    requireAgent().runManagedProjectSession(action, input, options),
`
replaceOnce(
  'server/src/agent/agent-client.mjs',
  '  uiUrl: (options = {}) => requireAgent().uiUrl(options),',
  `${agentFacadeMethods}  uiUrl: (options = {}) => requireAgent().uiUrl(options),`,
  'requireAgent().runManagedProjectSession(action, input, options)',
)

const managedMethod = fs.readFileSync(
  path.join(here, 'overlays', 'managed-project-session-method.mjs.txt'),
  'utf8',
).replace(/\r\n/g, '\n')
replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  '  coordinatorInstructions(message) {',
  `${managedMethod}\n  coordinatorInstructions(message) {`,
  'async runManagedProjectSession(action, input, {',
)

{
  const relative = 'server/src/agent/acp-backend-adapter.mjs'
  const desired = "import { clearDshCoordinatorBinding, readDshCoordinatorBinding, writeDshCoordinatorBinding } from './dsh-coordinator-binding.mjs'"
  let source = read(relative)
  source = source.replace(/^import .* from '\.\/dsh-coordinator-binding\.mjs'\n/gm, '')
  const anchor = "import { AcpSessionRegistry } from './acp-session-registry.mjs'"
  if (!source.includes(anchor)) {
    throw new Error(`Unexpected source in ${relative}; refusing to install Coordinator binding import.`)
  }
  source = source.replace(anchor, `${anchor}\n${desired}`)
  write(relative, source)
  console.log(`normalized: ${relative} (Coordinator binding import)`)
}

const coordinatorMethod = fs.readFileSync(
  path.join(here, 'overlays', 'ensure-coordinator-session-method.mjs.txt'),
  'utf8',
).replace(/\r\n/g, '\n')
replaceSection(
  'server/src/agent/acp-backend-adapter.mjs',
  '  async ensureCoordinatorSession(ownerId, mcpServers = []) {',
  '  async ensureCoordinatorToolRegistration(ownerId, context) {',
  coordinatorMethod,
  'COORDINATOR_UNAVAILABLE: DSH Coordinator binding is missing or invalid',
)

const rebindMethod = fs.readFileSync(
  path.join(here, 'overlays', 'rebind-coordinator-method.mjs.txt'),
  'utf8',
).replace(/\r\n/g, '\n')
replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  '  discardCoordinatorSession(ownerId, sessionId = \'\') {',
  `${rebindMethod}  discardCoordinatorSession(ownerId, sessionId = '') {`,
  'async rebindCoordinatorSession(ownerId, { sessionId, cwd })',
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `        if (previous) {
          this.registry.set(key, previous)
          writeDshCoordinatorBinding(previous)
        }
        throw error`,
  `        if (previous) {
          this.registry.set(key, previous)
          writeDshCoordinatorBinding(previous)
        } else {
          this.registry.delete(key)
          clearDshCoordinatorBinding()
        }
        throw error`,
  'clearDshCoordinatorBinding()',
)

const agentClientMethods = `  getCoordinatorBinding() {
    return this.adapter.getCoordinatorBinding()
  }

  rebindCoordinatorSession(ownerId, binding) {
    return this.adapter.rebindCoordinatorSession(ownerId, binding)
  }

`
replaceOnce(
  'server/src/agent/agent-client.mjs',
  '  listProjectSessions(input = {}) {',
  `${agentClientMethods}  listProjectSessions(input = {}) {`,
  'rebindCoordinatorSession(ownerId, binding)',
)

const coordinatorFacadeMethods = `  getCoordinatorBinding: () => requireAgent().getCoordinatorBinding(),
  rebindCoordinatorSession: (ownerId, binding) =>
    requireAgent().rebindCoordinatorSession(ownerId, binding),
`
replaceOnce(
  'server/src/agent/agent-client.mjs',
  '  listProjectSessions: (input = {}) =>',
  `${coordinatorFacadeMethods}  listProjectSessions: (input = {}) =>`,
  'getCoordinatorBinding: () => requireAgent().getCoordinatorBinding()',
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  'if (continuationRequested && !envelope?.input?.trusted_backend_event) {',
  `// Native DSH plugin tools own semantic routing; never select sessions[0].
    if (false && continuationRequested && !envelope?.input?.trusted_backend_event) {`,
  'Native DSH plugin tools own semantic routing',
  { optional: true },
)

replaceOnce(
  'server/src/app/bootstrap.mjs',
  "import { webDistributionPath } from '../core/install-paths.mjs'",
  "import { webDistributionPath } from '../core/install-paths.mjs'\nimport { attachDshSessionApi } from './dsh-session-api.mjs'",
  "import { attachDshSessionApi } from './dsh-session-api.mjs'",
)
replaceOnce(
  'server/src/app/bootstrap.mjs',
  "app.use(express.json({ limit: '1mb' }))",
  `app.use(express.json({ limit: '1mb' }))

attachDshSessionApi(app, {
  agent,
  taskManager,
  personalOwnerId: config.personalOwnerId,
})`,
  'attachDshSessionApi(app, {',
)

const apiOverlay = path.join(here, 'overlays', 'dsh-session-api.mjs')
const apiTarget = path.join(root, 'server/src/app/dsh-session-api.mjs')
fs.copyFileSync(apiOverlay, apiTarget)
console.log('installed: server/src/app/dsh-session-api.mjs')

const bindingOverlay = path.join(here, 'overlays', 'dsh-coordinator-binding.mjs')
const bindingTarget = path.join(root, 'server/src/agent/dsh-coordinator-binding.mjs')
fs.copyFileSync(bindingOverlay, bindingTarget)
console.log('installed: server/src/agent/dsh-coordinator-binding.mjs')

console.log('Qwen Audio Agent integration patch complete.')
