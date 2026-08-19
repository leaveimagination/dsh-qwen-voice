import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export const name = 'qwen-coordinator-tools'
export const inject = ['tools']

const COORDINATOR_BINDING_PATH = process.env.QWEN_COORDINATOR_BINDING_PATH
  ? resolve(process.env.QWEN_COORDINATOR_BINDING_PATH)
  : resolve(homedir(), '.config', 'qwaudio', 'dsh-coordinator.json')
const GATEWAY_ORIGIN = process.env.QWEN_COORDINATOR_GATEWAY_ORIGIN
  || 'http://127.0.0.1:3101'
const API_TOKEN = 'dsh-local-3cf6f8d1a4e74279b5377ad91804e945'

type Action = 'list' | 'start' | 'send' | 'status' | 'cancel'

type CoordinatorBinding = {
  version: number
  sessionId: string
  cwd: string
}

function coordinatorBinding(): CoordinatorBinding | null {
  try {
    const value = JSON.parse(readFileSync(COORDINATOR_BINDING_PATH, 'utf8'))
    if (
      value?.version !== 1
      || !/^session-[0-9a-f-]{36}$/i.test(String(value?.sessionId || ''))
      || typeof value?.cwd !== 'string'
      || !value.cwd.trim()
    ) return null
    return value as CoordinatorBinding
  } catch {
    return null
  }
}

function currentSessionId(exec: ToolRunContext): string {
  const agent = exec.agent
  if (!agent) return ''
  const ids = [agent.id, agent.session.id, agent.session.header.id].map(String)
  return ids.every(id => id === ids[0]) ? ids[0] : ''
}

async function invoke(
  action: Action,
  input: Record<string, unknown>,
  exec: ToolRunContext,
): Promise<{ result: string }> {
  const binding = coordinatorBinding()
  if (!binding) {
    return { result: JSON.stringify({
      status: 'rejected',
      code: 'COORDINATOR_UNAVAILABLE',
      message: `Coordinator binding is missing or invalid: ${COORDINATOR_BINDING_PATH}`,
    }) }
  }
  const sessionId = currentSessionId(exec)
  if (sessionId !== binding.sessionId) {
    return { result: JSON.stringify({
      status: 'rejected',
      code: 'COORDINATOR_ONLY',
      current_session_id: sessionId,
      coordinator_session_id: binding.sessionId,
    }) }
  }
  // Never let a Gateway request hang forever: a stalled cancellation used to
  // block the coordinator for ~14 minutes (2026-08-19 incident). Time out and
  // return a readable error so the model can report the failure instead of
  // waiting indefinitely.
  const timeoutMs = Number(process.env.QWEN_COORDINATOR_TOOL_TIMEOUT_MS) || 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Gateway request timed out after ${timeoutMs}ms`)), timeoutMs)
  exec.signal?.addEventListener('abort', () => controller.abort(exec.signal.reason), { once: true })
  try {
    const response = await fetch(`${GATEWAY_ORIGIN}/api/dsh/session-tools/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dsh-qwen-token': API_TOKEN,
      },
      body: JSON.stringify({
        input,
        coordinator_session_id: sessionId,
        call_id: String(exec.callId),
        cwd: exec.agent?.session.header.cwd || '',
      }),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) {
      let detail: unknown = body.slice(0, 500)
      try { detail = JSON.parse(body) } catch { /* keep text */ }
      return { result: JSON.stringify({
        status: 'error',
        code: 'QWEN_GATEWAY_REQUEST_FAILED',
        http_status: response.status,
        detail,
      }) }
    }
    return { result: body }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error)
    return { result: JSON.stringify({
      status: 'error',
      code: 'QWEN_GATEWAY_REQUEST_ERROR',
      message,
    }) }
  } finally {
    clearTimeout(timer)
  }
}

const output = {
  schema: {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: { result: { type: 'string' as const, required: true as const } },
  },
  render: (_args: unknown, value: { result: string }) => [{
    type: 'text' as const,
    text: value.result,
  }],
} as const

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'qwen_audio_agent_sessions_list',
    description: 'List DSH project Sessions before continuing previous work. Coordinator only.',
    parameters: {
      query: { type: 'string', description: 'Optional title or directory search.' },
      limit: { type: 'number', description: 'Maximum results, from 1 to 100.' },
    },
    output,
    execute: (args, exec) => invoke('list', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'qwen_audio_agent_session_start',
    description: 'Start a new managed DSH project Session asynchronously. Coordinator only.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Natural-language task.' },
      title: { type: 'string', description: 'Optional session title.' },
      parent_work_id: { type: 'string', required: true, description: 'Coordinator request_id from the request envelope.' },
    },
    output,
    execute: (args, exec) => invoke('start', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'qwen_audio_agent_session_send',
    description: 'Continue an exact existing DSH project Session asynchronously. Coordinator only.',
    parameters: {
      session_id: { type: 'string', required: true, description: 'Exact Session ID from sessions_list.' },
      prompt: { type: 'string', required: true, description: 'Natural-language follow-up task.' },
      parent_work_id: { type: 'string', required: true, description: 'Coordinator request_id from the request envelope.' },
    },
    output,
    execute: (args, exec) => invoke('send', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'qwen_audio_agent_session_status',
    description: 'Read managed task status by work, delegation, or Session ID. Coordinator only.',
    parameters: {
      work_id: { type: 'string', description: 'Qwen Task Manager work ID.' },
      delegation_id: { type: 'string', description: 'Delegation ID.' },
      session_id: { type: 'string', description: 'Target DSH Session ID.' },
    },
    output,
    execute: (args, exec) => invoke('status', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'qwen_audio_agent_session_cancel',
    description: 'Cancel the managed task and its real target DSH Session. Coordinator only.',
    parameters: {
      work_id: { type: 'string', description: 'Qwen Task Manager work ID.' },
      delegation_id: { type: 'string', description: 'Delegation ID.' },
      session_id: { type: 'string', description: 'Target DSH Session ID.' },
    },
    output,
    execute: (args, exec) => invoke('cancel', args, exec),
  }))
}
