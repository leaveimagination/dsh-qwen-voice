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

// Realtime must classify the relationship to existing work explicitly. The
// bridge consumes this structured decision from the coordinator envelope;
// it never guesses routing from user text or keywords.
replaceOnce(
  'server/src/voice/frontend-tools.mjs',
  `        objective: {
          type: 'string',
          description: '可直接执行的目标，忠实保留用户要求的结果、约束、执行方式，以及本项工作与既有工作的关系。可以根据当前对话消解明确指代，但不得遗漏、推断或改变这些语义，也不要提交占位目标；近期对话会随工作一并提供。',
        },
      },
      required: ['objective'],`,
  `        objective: {
          type: 'string',
          description: '可直接执行的目标，忠实保留用户要求的结果、约束、执行方式，以及本项工作与既有工作的关系。可以根据当前对话消解明确指代，但不得遗漏、推断或改变这些语义，也不要提交占位目标；近期对话会随工作一并提供。',
        },
        routing: {
          type: 'string',
          enum: ['new_task', 'continue_task', 'modify_active_task'],
          description: 'new_task=独立新工作；continue_task=继续既有但当前未执行的工作；modify_active_task=补充、纠正或重定向正在执行的工作。不得仅凭“再”“继续”等单个词判断，必须结合完整对话语义。',
        },
        target_work_id: {
          type: 'string',
          description: '已由系统返回且用户明确指向的 work_id；不得猜造。modify_active_task 在存在多个活动任务时必须提供。',
        },
      },
      required: ['objective', 'routing'],`,
  "enum: ['new_task', 'continue_task', 'modify_active_task']",
)

replaceOnce(
  'server/src/voice/frontend-tools.mjs',
  `    description: '执行需要当前信息、搜索、检查、工具、文件、屏幕、应用、代码、图片生成、创作，或继续、修改已有工作的请求。这是你向用户提供的执行能力；请求明确时直接调用，不要先否认能力或说需要转交。询问此前工作的状态、进度或阶段结果时改用 get_agent_task_status。返回 accepted 只表示已受理，不表示已完成。',`,
  `    description: '执行需要当前信息、搜索、检查、工具、文件、屏幕、应用、代码、图片生成、创作，或继续、修改已有工作的请求。这是你向用户提供的执行能力；请求明确时直接调用，不要先否认能力或说需要转交。用户要求给正在执行的任务追加要求、纠正方向、改变重点或重定向时，必须直接调用本工具并设置 routing=modify_active_task，不要先调用 get_agent_task_status。只有单纯询问状态、进度或阶段结果时才改用 get_agent_task_status。返回 accepted 只表示已受理，不表示已完成。',`,
  '只有单纯询问状态、进度或阶段结果时',
)

replaceOnce(
  'server/src/voice/frontend-tools.mjs',
  `    description: '查询此前工作的状态、进度或阶段结果，也可列出当前会话中的工作、定时任务和提醒。用户询问此前工作时统一调用，不要改用 spawn_thinking。查询单项可传入已知 ID；省略时查询最近一项；列出全部时设置 list_all=true。',`,
  `    description: '仅查询此前工作的状态、进度或阶段结果，也可列出当前会话中的工作、定时任务和提醒。不得用于给任务追加要求、纠正方向、改变重点或重定向；这些操作即使针对正在执行的任务，也必须调用 spawn_thinking 并设置 routing=modify_active_task。查询单项可传入已知 ID；省略时查询最近一项；列出全部时设置 list_all=true。',`,
  '不得用于给任务追加要求、纠正方向、改变重点或重定向',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `  createWork({ turnId, objective, verbatimRequest, submissionKey }) {`,
  `  createWork({ turnId, objective, verbatimRequest, submissionKey, routing }) {`,
  'submissionKey, routing })',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `          workingDirectory: this.getClientContext()?.workingDirectory,
        }`,
  `          workingDirectory: this.getClientContext()?.workingDirectory,
          routing,
        }`,
  'workingDirectory: this.getClientContext()?.workingDirectory,\n          routing,',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `      task = this.createWork({
        turnId,
        objective,
        verbatimRequest,
        submissionKey,
      })`,
  `      const requestedRouting = String(args.routing || 'new_task')
      const targetWorkId = String(args.target_work_id || '').trim()
      const outerTasks = this.taskManager.list({ ownerId: this.ownerId })
        .filter(item => !item.parentWorkId)
      const activeTasks = outerTasks.filter(item => [
        'running', 'delegated',
      ].includes(item.status))
      let targetTask = targetWorkId
        ? outerTasks.find(item => item.id === targetWorkId)
        : null
      if (requestedRouting === 'modify_active_task' && !targetTask) {
        if (activeTasks.length !== 1) {
          await this.sendOutput(callId, failure(
            activeTasks.length ? 'ambiguous_task_target' : 'active_task_not_found',
            activeTasks.length
              ? '当前有多个进行中的任务，请先确认要修改哪一项。'
              : '没有找到仍在执行、可被修改的任务。',
            { retryable: true, candidates: activeTasks.map(item => ({ work_id: item.id, objective: item.objective })) },
          ), turnId)
          return
        }
        targetTask = activeTasks[0]
      }
      if (requestedRouting === 'modify_active_task' && !activeTasks.some(item => item.id === targetTask?.id)) {
        await this.sendOutput(callId, failure(
          'active_task_not_found',
          '指定任务已不在运行，不能把本轮作为执行中修改发送。',
          { retryable: true },
        ), turnId)
        return
      }
      const routing = {
        intent: requestedRouting,
        target_work_id: targetTask?.id || targetWorkId || null,
        target_status: targetTask?.status || null,
        delivery: requestedRouting === 'modify_active_task' ? 'steer' : 'queue',
      }
      task = this.createWork({
        turnId,
        objective,
        verbatimRequest,
        submissionKey,
        routing,
      })`,
  "delivery: requestedRouting === 'modify_active_task' ? 'steer' : 'queue'",
)

replaceOnce(
  'server/src/agent/coordinator.mjs',
  `  delivery = {},
}) {`,
  `  delivery = {},
  routing = {},
}) {`,
  'delivery = {},\n  routing = {},',
)

replaceOnce(
  'server/src/agent/coordinator.mjs',
  `      objective: clean(objective),
      ...(trustedBackendEvent`,
  `      objective: clean(objective),
      routing: {
        intent: clean(routing.intent) || 'new_task',
        target_work_id: clean(routing.target_work_id) || null,
        target_status: clean(routing.target_status) || null,
        delivery: routing.delivery === 'steer' ? 'steer' : 'queue',
      },
      ...(trustedBackendEvent`,
  "delivery: routing.delivery === 'steer' ? 'steer' : 'queue'",
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `  async queryDelegatedWork(workId, question, {`,
  `  async redirectDelegatedWork(workId, instruction, { ownerId } = {}) {
    const run = this.delegatedWorkRuns.get(clean(workId))
    const record = run?.delegation
    const coordinatorRun = this.managedCoordinatorRuns.get(clean(workId))
    const coordinator = this.coordinatorSessions.get(
      coordinatorKey(ownerId, this.protocol),
    )
    const targetSessionId = record?.sessionId
      || (coordinatorRun?.ownerId === clean(ownerId) ? coordinator?.sessionId : '')
    if (!targetSessionId || (record && record.ownerId !== clean(ownerId))) {
      throw new AgentError('ACTIVE_DELEGATION_NOT_FOUND: the target work is not running', {
        status: 409,
        protocol: this.protocol,
      })
    }
    if (record && record.status !== 'running') {
      throw new AgentError('ACTIVE_DELEGATION_NOT_FOUND: the target work is no longer running', {
        status: 409,
        protocol: this.protocol,
      })
    }
    const endpoint = new URL(process.env.DSH_WEB_URL || 'http://127.0.0.1:3080')
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
      throw new AgentError('DSH_REDIRECT_UNAVAILABLE: only a loopback DSH endpoint is allowed', {
        status: 403,
        protocol: this.protocol,
      })
    }
    const rpcId = randomUUID()
    const response = await fetch(\`${'${endpoint.origin}'}/api/session.prompt\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'session.prompt',
        payload: {
          sessionId: targetSessionId,
          mode: 'steer',
          content: [{ type: 'text', text: clean(instruction) }],
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    })
    if (!response.ok) {
      throw new AgentError(\`DSH_REDIRECT_FAILED: HTTP ${'${response.status}'}\`, {
        status: response.status,
        protocol: this.protocol,
      })
    }
    const envelope = await response.json()
    if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true) {
      const reason = envelope?.result?.error?.message || 'unknown DSH redirect error'
      throw new AgentError(\`DSH_REDIRECT_FAILED: ${'${reason}'}\`, {
        status: 409,
        protocol: this.protocol,
      })
    }
    return {
      status: 'redirected',
      workId: clean(workId),
      delegationId: record?.id || null,
      sessionId: targetSessionId,
      layer: record ? 'delegated' : 'coordinator',
    }
  }

  async queryDelegatedWork(workId, question, {`,
  'async redirectDelegatedWork(workId, instruction',
)

replaceOnce(
  'server/src/agent/agent-client.mjs',
  `  uiUrl(options = {}) {`,
  `  redirectDelegatedWork(workId, instruction, options = {}) {
    return this.adapter.redirectDelegatedWork(workId, instruction, options)
  }

  uiUrl(options = {}) {`,
  'return this.adapter.redirectDelegatedWork(workId, instruction, options)',
)

replaceOnce(
  'server/src/agent/agent-client.mjs',
  `  uiUrl: (options = {}) => requireAgent().uiUrl(options),`,
  `  redirectDelegatedWork: (workId, instruction, options = {}) =>
    requireAgent().redirectDelegatedWork(workId, instruction, options),
  uiUrl: (options = {}) => requireAgent().uiUrl(options),`,
  'requireAgent().redirectDelegatedWork(workId, instruction, options)',
)

replaceOnce(
  'server/src/agent/coordinator.mjs',
  `  async run(input, options = {}) {`,
  `  redirectDelegatedWork(workId, instruction, options = {}) {
    return this.client.redirectDelegatedWork(workId, instruction, options)
  }

  async run(input, options = {}) {`,
  'this.client.redirectDelegatedWork(workId, instruction, options)',
)

replaceOnce(
  'server/src/voice/tools/tool-call-handler.mjs',
  `      const routing = {
        intent: requestedRouting,`,
  `      if (requestedRouting === 'modify_active_task') {
        await this.coordinator.redirectDelegatedWork(
          targetTask.id,
          objective,
          { ownerId: this.ownerId },
        )
        await this.sendOutput(
          callId,
          {
            status: 'redirected',
            work_id: targetTask.id,
            message: '已更新正在执行的任务。',
          },
          turnId,
          targetTask.id,
          {
            response: {
              instructions: [
                '这条补充已经直接更新到原任务，不是新任务。',
                '只需简短确认修改内容已经送达；不要声称任务完成。',
              ].join(' '),
            },
          },
        )
        return
      }
      const routing = {
        intent: requestedRouting,`,
  "status: 'redirected',\n            work_id: targetTask.id",
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

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `    this.activeCoordinatorTurns = new Set()
    this.delegatedWorkRuns = new Map()`,
  `    this.activeCoordinatorTurns = new Set()
    // Exposes only currently executing Coordinator turns to the trusted local
    // DSH Session API so its tool call can attach the delegation to that run.
    this.managedCoordinatorRuns = new Map()
    this.delegatedWorkRuns = new Map()`,
  'this.managedCoordinatorRuns = new Map()',
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `    this.activeCoordinatorTurns.add(session.sessionId)
    try {`,
  `    this.activeCoordinatorTurns.add(session.sessionId)
    this.managedCoordinatorRuns.set(clean(coordinationRunId), run)
    try {`,
  'this.managedCoordinatorRuns.set(clean(coordinationRunId), run)',
)

replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `    } finally {
      this.activeCoordinatorTurns.delete(session.sessionId)`,
  `    } finally {
      if (this.managedCoordinatorRuns.get(clean(coordinationRunId)) === run) {
        this.managedCoordinatorRuns.delete(clean(coordinationRunId))
      }
      this.activeCoordinatorTurns.delete(session.sessionId)`,
  'this.managedCoordinatorRuns.delete(clean(coordinationRunId))',
)

const managedMethod = fs.readFileSync(
  path.join(here, 'overlays', 'managed-project-session-method.mjs.txt'),
  'utf8',
).replace(/\r\n/g, '\n')
{
  const relative = 'server/src/agent/acp-backend-adapter.mjs'
  const start = '  /** Run a trusted local project-session operation through normal delegation events. */'
  if (read(relative).includes(start)) {
    replaceSection(
      relative,
      start,
      '  coordinatorInstructions(message) {',
      `${managedMethod}\n`,
      'COORDINATOR_RUN_UNAVAILABLE: the active Coordinator turn cannot accept this delegation',
    )
  } else {
    replaceOnce(
      relative,
      '  coordinatorInstructions(message) {',
      `${managedMethod}\n  coordinatorInstructions(message) {`,
      'COORDINATOR_RUN_UNAVAILABLE: the active Coordinator turn cannot accept this delegation',
    )
  }
}

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

// Cancel must never re-drive the coordinator when the cancellation was issued
// by the coordinator itself. In the DSH integration the coordinator is a
// native DSH Session, so it is never registered in activeCoordinatorTurns /
// managedCoordinatorRuns: `busy` is always false here and the old
// coordinatorControl branch asked the coordinator (which is itself executing
// this cancellation tool call) to run another turn cancelling the same work —
// a self-recursive deadlock. Observed 2026-08-19 14:44: the cancel tool hung
// ~58s until the user hit stop, then the plugin stayed frozen ~14 minutes.
// Cancellation now always goes straight to the ACP transport (abort +
// cancelSession) and the coordinator learns the outcome via
// pendingCoordinatorFacts reconciliation.
replaceOnce(
  'server/src/agent/acp-backend-adapter.mjs',
  `    const coordinator = this.coordinatorSessions.get(
      coordinatorKey(ownerId, this.protocol),
    )
    const busy = coordinator
      && this.activeCoordinatorTurns.has(coordinator.sessionId)
    if (!busy) {
      try {
        const instruction = this.profile.cancelInstruction?.(record)
          || \`请调用 qwen_audio_agent_session_cancel 取消 delegation_id=\${record.id}。\`
        await this.coordinatorControl(workId, [
          '<qwen_audio_agent_control kind="cancel">',
          instruction,
          '工具返回后只简短确认，不要做其他工作。',
          '</qwen_audio_agent_control>',
        ].join('\\n'), { ownerId, signal })
        return {
          route: 'coordinator',
          layer: 'delegated',
          delegationId: record.id,
          sessionId: record.sessionId,
        }
      } catch {
        // Cancellation is urgent; fall through to the ACP transport.
      }
    }
    await this.cancelDelegation({ delegation_id: record.id })`,
  `    const coordinator = this.coordinatorSessions.get(
      coordinatorKey(ownerId, this.protocol),
    )
    // DSH integration: the coordinator is a native DSH Session, which is never
    // registered in activeCoordinatorTurns/managedCoordinatorRuns, so "busy" is
    // always false. Driving coordinatorControl here would ask the coordinator
    // (which is itself executing this cancellation tool call) to run another
    // turn that cancels the same work - a self-recursive deadlock that froze
    // the plugin for ~14 minutes (2026-08-19 14:44 incident). Cancellation
    // always goes straight to the ACP transport: abort + cancelSession. The
    // coordinator learns the outcome through pendingCoordinatorFacts.
    if (false && !busy) {
      try {
        const instruction = this.profile.cancelInstruction?.(record)
          || \`请调用 qwen_audio_agent_session_cancel 取消 delegation_id=\${record.id}。\`
        await this.coordinatorControl(workId, [
          '<qwen_audio_agent_control kind="cancel">',
          instruction,
          '工具返回后只简短确认，不要做其他工作。',
          '</qwen_audio_agent_control>',
        ].join('\\n'), { ownerId, signal })
        return {
          route: 'coordinator',
          layer: 'delegated',
          delegationId: record.id,
          sessionId: record.sessionId,
        }
      } catch {
        // Cancellation is urgent; fall through to the ACP transport.
      }
    }
    await this.cancelDelegation({ delegation_id: record.id })`,
  'self-recursive deadlock that froze',
)

console.log('Qwen Audio Agent integration patch complete.')
