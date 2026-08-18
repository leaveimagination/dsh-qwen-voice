import { randomUUID, timingSafeEqual } from 'node:crypto'

const API_TOKEN = 'dsh-local-3cf6f8d1a4e74279b5377ad91804e945'
const ACTIONS = new Set(['list', 'start', 'send', 'status', 'cancel'])

function authorized(req) {
  const actual = Buffer.from(String(req.headers['x-dsh-qwen-token'] || ''))
  const expected = Buffer.from(API_TOKEN)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function pickTask(taskManager, ownerId, input = {}) {
  const tasks = taskManager.list({ ownerId })
  if (input.work_id) return tasks.find(task => task.id === input.work_id)
  if (input.delegation_id) return tasks.find(task => task.delegation?.id === input.delegation_id)
  if (input.session_id) return tasks.find(task => task.delegation?.sessionId === input.session_id)
  return tasks[0]
}

function terminal(status) {
  return ['completed', 'failed', 'cancelled'].includes(String(status || ''))
}

function waitForDispatch(taskManager, workId, ownerId, timeoutMs = 30_000) {
  const current = taskManager.get(workId, { ownerId })
  if (current?.status === 'delegated' || terminal(current?.status)) {
    return Promise.resolve(current)
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error('Timed out while starting the target DSH Session'))
    }, timeoutMs)
    timer.unref?.()
    const stop = taskManager.subscribe(event => {
      if (event.task?.id !== workId) return
      if (event.task.status !== 'delegated' && !terminal(event.task.status)) return
      clearTimeout(timer)
      stop()
      resolve(event.task)
    })
  })
}

export function attachDshSessionApi(app, { agent, taskManager, personalOwnerId }) {
  app.get('/api/dsh/coordinator-binding', (req, res) => {
    if (!authorized(req)) return res.status(403).json({ error: 'forbidden' })
    const binding = agent.getCoordinatorBinding()
    return res.json({
      status: binding ? 'bound' : 'unbound',
      binding,
    })
  })

  app.post('/api/dsh/coordinator-binding', async (req, res, next) => {
    if (!authorized(req)) return res.status(403).json({ error: 'forbidden' })
    const sessionId = String(req.body?.session_id || '').trim()
    if (!/^session-[0-9a-f-]{36}$/i.test(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' })
    }
    const ownerId = req.identity?.ownerId || personalOwnerId
    try {
      // Never trust browser-provided cwd or identity metadata. Resolve the
      // exact Session through the ACP/DSH backend before committing a binding.
      const current = agent.getCoordinatorBinding()
      // A takeover usually selects another Session in the same DSH project.
      // The project catalog intentionally hides internal/coordinator Sessions,
      // so use the already verified project cwd as a resume hint and let ACP
      // resumeSession verify the exact new Session ID.
      let cwd = String(current?.cwd || '').trim()
      if (!cwd) {
        const catalog = await agent.listProjectSessions({ limit: 100 })
        const session = (catalog.sessions || []).find(item => (
          String(item.session_id || item.sessionId || '') === sessionId
        ))
        cwd = String(session?.cwd || session?.directory || '').trim()
        if (!session || !cwd) {
          return res.status(404).json({
            error: 'COORDINATOR_UNAVAILABLE',
            message: 'The selected DSH Session does not exist or cannot be verified.',
          })
        }
      }
      const result = await agent.rebindCoordinatorSession(ownerId, { sessionId, cwd })
      return res.json(result)
    } catch (error) {
      return next(error)
    }
  })

  app.post('/api/dsh/session-tools/:action', async (req, res, next) => {
    if (!authorized(req)) return res.status(403).json({ error: 'forbidden' })
    const action = String(req.params.action || '')
    if (!ACTIONS.has(action)) return res.status(404).json({ error: 'unknown action' })
    const input = req.body?.input || {}
    const coordinatorSessionId = String(req.body?.coordinator_session_id || '')
    const ownerId = req.identity?.ownerId || personalOwnerId
    try {
      if (action === 'list') {
        const catalog = await agent.listProjectSessions(input)
        return res.json({
          ...catalog,
          sessions: (catalog.sessions || []).filter(session => (
            session.session_id !== coordinatorSessionId
          )),
        })
      }
      if (action === 'status') {
        return res.json(pickTask(taskManager, ownerId, input) || { status: 'not_found' })
      }
      if (action === 'cancel') {
        const task = pickTask(taskManager, ownerId, input)
        if (!task) return res.json({ status: 'not_found' })
        if (terminal(task.status)) {
          return res.json({
            status: 'already_terminal',
            terminal_state: task.status,
            cancelled: false,
            work_id: task.id,
          })
        }
        const result = await taskManager.cancel(task.id, { ownerId })
        return res.json(result || {
          status: 'already_terminal',
          terminal_state: taskManager.get(task.id, { ownerId })?.status || 'unknown',
          cancelled: false,
          work_id: task.id,
        })
      }

      let workId = ''
      const callId = String(req.body?.call_id || randomUUID())
      const task = taskManager.create({
        objective: String(input.prompt || '').trim(),
        ownerId,
        sessionId: coordinatorSessionId,
        turnId: callId,
        parentWorkId: String(input.parent_work_id || '').trim() || null,
        submissionKey: `dsh:${coordinatorSessionId}:${callId}`,
        laneKey: `dsh-project:${ownerId}`,
        laneLimit: 4,
        suppressNotification: true,
        runner: (_objective, { onEvent, signal }) => agent.runManagedProjectSession(
          action,
          input,
          {
            ownerId,
            coordinationRunId: workId,
            cwd: String(req.body?.cwd || ''),
            signal,
            onEvent,
          },
        ),
        canceler: async ({ abort }) => {
          const result = await agent.cancelDelegatedWork(workId, {
            ownerId,
            direct: true,
          })
          abort()
          return result
        },
      })
      workId = task.id
      const dispatched = await waitForDispatch(taskManager, task.id, ownerId)
      if (dispatched.status !== 'delegated') {
        return res.status(dispatched.status === 'failed' ? 502 : 409).json({
          status: dispatched.status,
          work_id: dispatched.id,
          error: dispatched.error || null,
        })
      }
      return res.status(202).json({
        status: 'started',
        work_id: dispatched.id,
        delegation_id: dispatched.delegation?.id,
        target_session_id: dispatched.delegation?.sessionId,
        objective: dispatched.objective,
      })
    } catch (error) {
      return res.status(Number(error?.status) || 500).json({
        status: 'error',
        code: String(error?.code || 'DSH_SESSION_TOOL_FAILED'),
        message: String(error?.message || error || 'Unknown DSH Session tool error'),
      })
    }
  })
}
