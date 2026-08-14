#!/usr/bin/env node

import * as acp from '@agentclientprotocol/sdk'
import { Readable, Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3080'
const DEFAULT_POLL_MS = 500
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

export function promptText(parts) {
  return parts
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

export function assistantText(events, afterSeq = -1) {
  const chunks = []
  for (const entry of events) {
    const event = entry?.event ?? entry
    if (event?.seq <= afterSeq || event?.type !== 'assistant/message') continue
    for (const block of event.data?.message?.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string') chunks.push(block.text)
    }
  }
  return chunks.join('\n').trim()
}

function lastSeq(events) {
  return events.reduce((value, entry) => Math.max(value, Number((entry?.event ?? entry)?.seq ?? -1)), -1)
}

function completedAfter(events, afterSeq) {
  return events.some((entry) => {
    const event = entry?.event ?? entry
    return event?.seq > afterSeq && event?.type === 'turn/end'
  })
}

function taskTitleHint(text) {
  const match = String(text || '').match(/"objective"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return ''
  try {
    const objective = JSON.parse(`"${match[1]}"`).trim()
    return objective ? `任务：${objective.slice(0, 100)}` : ''
  } catch {
    return ''
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('cancelled'))
    }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export class DshWebClient {
  constructor(baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch) {
    const parsed = new URL(baseUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error(`DSH Web bridge only permits loopback hosts, got ${parsed.hostname}`)
    }
    this.baseUrl = parsed.origin
    this.fetch = fetchImpl
  }

  async call(method, payload, signal) {
    const rpcId = crypto.randomUUID()
    const response = await this.fetch(`${this.baseUrl}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
      signal,
    })
    if (!response.ok) throw new Error(`DSH Web ${method} transport failed: HTTP ${response.status}`)
    const envelope = await response.json()
    if (envelope?.rpcId !== rpcId) throw new Error(`DSH Web ${method} rpcId mismatch`)
    if (envelope?.result?.ok !== true) {
      const error = envelope?.result?.error
      throw new Error(`DSH Web ${method} failed: ${error?.message ?? JSON.stringify(error)}`)
    }
    return envelope.result.value
  }

  create(cwd, signal) {
    return this.call('session.create', { cwd }, signal)
  }

  history(sessionId, signal) {
    return this.call('session.history', { sessionId, maxMessages: 20 }, signal)
  }

  list({ cwd, cursor, limit = 100 } = {}, signal) {
    return this.call('session.list', {
      ...(cwd ? { cwd } : {}),
      ...(cursor ? { cursor } : {}),
      limit,
    }, signal)
  }

  prompt(sessionId, text, signal) {
    return this.call('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, signal)
  }

  cancel(sessionId) {
    return this.call('session.cancel', { sessionId })
  }
}

export class DshWebAcpAgent {
  constructor(client, options = {}) {
    this.client = client
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.active = new Map()
  }

  async initialize() {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { list: {} },
      },
    }
  }

  async newSession(params) {
    const cwd = params.cwd || process.env.DSH_WEB_WORKSPACE || process.cwd()
    const created = await this.client.create(cwd)
    return { sessionId: created.sessionId }
  }

  async loadSession(params) {
    // DSH owns the durable session log. Reading it verifies that the requested
    // session exists before the ACP client resumes work in it.
    await this.client.history(params.sessionId)
    return {}
  }

  async listSessions(params = {}) {
    const response = await this.client.list({
      cwd: params.cwd || undefined,
      cursor: params.cursor || undefined,
      limit: Number(params?._meta?.limit) || 100,
    })
    const sessions = (response?.items || [])
      .map(item => {
        const title = item?.projections?.values?.subagent?.label
          || item?.projections?.values?.title
          || null
        return {
          sessionId: item.sessionId,
          cwd: item.cwd,
          title,
          updatedAt: item.updatedAt
            ? new Date(Number(item.updatedAt)).toISOString()
            : null,
          _meta: {
            running: Boolean(item.running),
            origin: item.origin || null,
          },
        }
      })
      .filter(item => item.sessionId && item.cwd && item.title)
      .filter(item => !String(item.title).startsWith('<qwen_audio_agent_backend_instructions>'))
    return { sessions, nextCursor: response?.nextCursor || null }
  }

  async authenticate() {
    return {}
  }

  async prompt(params, cx) {
    const text = promptText(params.prompt)
    if (!text) throw new Error('DSH Web bridge requires at least one text prompt block')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('DSH Web turn timed out')), this.timeoutMs)
    this.active.get(params.sessionId)?.abort(new Error('superseded by a newer prompt'))
    this.active.set(params.sessionId, controller)
    try {
      const before = await this.client.history(params.sessionId, controller.signal)
      const beforeEvents = before.events ?? []
      const baseline = lastSeq(beforeEvents)
      const firstPrompt = !beforeEvents.some(entry => (
        (entry?.event ?? entry)?.type === 'user/message'
      ))
      const titleHint = firstPrompt ? taskTitleHint(text) : ''
      const routedText = titleHint
        ? `${titleHint}\n\n${text}`
        : text
      await this.client.prompt(params.sessionId, routedText, controller.signal)
      let history
      while (true) {
        history = await this.client.history(params.sessionId, controller.signal)
        if (completedAfter(history.events ?? [], baseline)) break
        await delay(this.pollMs, controller.signal)
      }
      const answer = assistantText(history.events ?? [], baseline)
      if (answer) {
        await cx.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: answer },
          },
        })
      }
      return { stopReason: 'end_turn' }
    } catch (error) {
      if (controller.signal.aborted) return { stopReason: 'cancelled' }
      throw error
    } finally {
      clearTimeout(timeout)
      if (this.active.get(params.sessionId) === controller) this.active.delete(params.sessionId)
    }
  }

  async cancel(params) {
    this.active.get(params.sessionId)?.abort(new Error('cancelled by ACP client'))
    try {
      await this.client.cancel(params.sessionId)
    } catch (error) {
      console.error(`[dsh-web-acp-bridge] cancel failed: ${String(error)}`)
    }
  }
}

export function serve() {
  const client = new DshWebClient(process.env.DSH_WEB_URL || DEFAULT_BASE_URL)
  const implementation = new DshWebAcpAgent(client)
  const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
  acp.agent({ name: 'dsh-web-acp-bridge' })
    .onRequest('initialize', ctx => implementation.initialize(ctx.params))
    .onRequest('session/new', ctx => implementation.newSession(ctx.params))
    .onRequest('session/list', ctx => implementation.listSessions(ctx.params))
    .onRequest('session/load', ctx => implementation.loadSession(ctx.params))
    .onRequest('authenticate', ctx => implementation.authenticate(ctx.params))
    .onRequest('session/prompt', ctx => implementation.prompt(ctx.params, ctx.client))
    .onNotification('session/cancel', ctx => implementation.cancel(ctx.params))
    .connect(stream)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) serve()
