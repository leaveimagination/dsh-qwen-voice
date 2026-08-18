#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', 'node_modules', 'qwen-audio-agent')
if (!fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error(
    'Bundled Qwen Audio Agent is missing. Run `pnpm install` in the plugin directory first.',
  )
}
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

// DSH-managed delegations are persisted by TaskManager and may not exist in
// ACP Adapter's process-local delegatedWorkRuns map. Pass the durable record
// into status queries so an in-memory cache miss is not reported as absence.
replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `              {
                ownerId: this.ownerId,
                signal,
              },
            )`,
  `              {
                ownerId: this.ownerId,
                signal,
                delegation: (() => {
                  const externalWorkId = task.delegation?.externalWorkId
                  const child = externalWorkId
                    ? this.taskManager.get(externalWorkId, { ownerId: this.ownerId })
                    : null
                  return child?.delegation || task.delegation || null
                })(),
              },
            )`,
  'child?.delegation || task.delegation || null',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `            throw error
          }
        },`,
  `            return {
              content: [
                '当前无法确认这项后台工作的实时状态。',
                '这不代表任务不存在，也不代表任务失败。',
                '不要重新创建或重新执行该任务；请稍后重试状态查询。',
              ].join(''),
              metadata: {
                parentWorkId: task.id,
                status: 'lookup_unavailable',
                authoritative: false,
                retryable: true,
                prohibitRestart: true,
                cause: String(error?.message || error || 'unknown error'),
              },
            }
          }
        },`,
  "status: 'lookup_unavailable'",
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `  async queryDelegatedWork(workId, question, { ownerId, signal } = {}) {
    const run = this.delegatedWorkRuns.get(clean(workId))
    const record = run?.delegation
    if (!record || record.ownerId !== clean(ownerId)) {
      throw new AgentError(\`没有找到对应的 ${'${this.label}'} 项目任务\`, {
        protocol: this.protocol,
      })
    }`,
  `  async queryDelegatedWork(workId, question, {
    ownerId,
    signal,
    delegation: persistedDelegation,
  } = {}) {
    const run = this.delegatedWorkRuns.get(clean(workId))
    let record = run?.delegation
    if (!record && clean(persistedDelegation?.id) && clean(persistedDelegation?.sessionId)) {
      record = {
        ...persistedDelegation,
        id: clean(persistedDelegation.id),
        sessionId: clean(persistedDelegation.sessionId),
        ownerId: clean(ownerId),
        workId: clean(workId),
        recoveredFromLedger: true,
      }
    }
    if (!record || record.ownerId !== clean(ownerId)) {
      throw new AgentError(\`TASK_LOOKUP_UNAVAILABLE: cannot resolve ${'${this.label}'} delegation\`, {
        protocol: this.protocol,
      })
    }`,
  'recoveredFromLedger: true',
)

// A status lookup that cannot establish the truth must never be converted by
// the Realtime model into a replacement task in the same voice turn.
replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `    this.turnTasks = new Map()
    this.deferredToolResponses = new Map()`,
  `    this.turnTasks = new Map()
    this.restartProhibitedTurns = new Set()
    this.deferredToolResponses = new Map()`,
  'this.restartProhibitedTurns = new Set()',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `    const pendingPermissionTask = this.taskManager.list({`,
  `    if (this.restartProhibitedTurns.has(turnId)) {
      await this.sendOutput(
        callId,
        failure(
          'task_restart_prohibited',
          '刚才的状态查询无法确认结果。本轮禁止重新创建或重新执行该任务，请稍后重新查询状态。',
          {
            retryable: false,
            status: 'lookup_unavailable',
            prohibit_restart: true,
          },
        ),
        turnId,
        null,
        {
          response: {
            instructions: '状态未知不等于任务不存在。本轮不要再次调用后台任务工具，也不要声称已经重新发起任务。',
          },
        },
      )
      return
    }

    const pendingPermissionTask = this.taskManager.list({`,
  "'task_restart_prohibited'",
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `            return {
              content: [
                '当前无法确认这项后台工作的实时状态。',`,
  `            this.restartProhibitedTurns.add(turnId)
            while (this.restartProhibitedTurns.size > 100) {
              this.restartProhibitedTurns.delete(
                this.restartProhibitedTurns.values().next().value,
              )
            }
            return {
              content: [
                '当前无法确认这项后台工作的实时状态。',`,
  'while (this.restartProhibitedTurns.size > 100)',
)

// Child work created by the fixed DSH Coordinator mirrors the outer voice
// work. Keep it addressable by ID, but never count it as a second user task.
replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `      const tasks = this.taskManager.list({
        ownerId: this.ownerId,
        sessionId: this.sessionId,
      }).slice(0, 20).map(task => ({`,
  `      const tasks = this.taskManager.list({
        ownerId: this.ownerId,
        sessionId: this.sessionId,
      }).filter(task => !task.parentWorkId).slice(0, 20).map(task => ({`,
  'filter(task => !task.parentWorkId).slice(0, 20)',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `    const targetId = requestedId || this.taskManager.list({
      ownerId: this.ownerId,
      sessionId: this.sessionId,
    }).find(task => [
      'scheduled',
      'queued',
      'running',
      'delegated',
      'finalizing',
    ].includes(task.status))?.id`,
  `    const targetId = requestedId || this.taskManager.list({
      ownerId: this.ownerId,
      sessionId: this.sessionId,
    }).find(task => (
      !task.parentWorkId
      && [
        'scheduled',
        'queued',
        'running',
        'delegated',
        'finalizing',
      ].includes(task.status)
    ))?.id`,
  '!task.parentWorkId\n      && [',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `      : this.taskManager.list({
          ownerId: this.ownerId,
          sessionId: this.sessionId,
        })[0]`,
  `      : this.taskManager.list({
          ownerId: this.ownerId,
          sessionId: this.sessionId,
        }).find(item => !item.parentWorkId)`,
  '.find(item => !item.parentWorkId)',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `      const active = this.taskManager.list({
        ownerId: this.ownerId,
      }).find(task => [
        'scheduled',
        'queued',
        'running',
        'delegated',
        'finalizing',
      ].includes(task.status))`,
  `      // Redirect only the user-visible outer work, never its mirrored child.
      const active = this.taskManager.list({
        ownerId: this.ownerId,
      }).find(task => (
        !task.parentWorkId
        && [
          'scheduled',
          'queued',
          'running',
          'delegated',
          'finalizing',
        ].includes(task.status)
      ))`,
  'Redirect only the user-visible outer work',
  { optional: true },
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
