import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantText, DshWebAcpAgent, promptText } from '../src/index.mjs'

test('promptText joins only text blocks', () => {
  assert.equal(promptText([
    { type: 'text', text: '你好' },
    { type: 'resource_link', uri: 'file:///x' },
    { type: 'text', text: 'DSH' },
  ]), '你好\nDSH')
})

test('assistantText reads text blocks after the baseline', () => {
  const events = [
    { event: { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: '旧' }] } } } },
    { event: { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'reasoning', text: '想' }, { type: 'text', text: '新' }] } } } },
  ]
  assert.equal(assistantText(events, 2), '新')
})

test('DSH client rejects non-loopback targets', async () => {
  const { DshWebClient } = await import('../src/index.mjs')
  assert.throws(() => new DshWebClient('https://example.com'), /only permits loopback/)
})

test('ACP advertises and validates durable session loading', async () => {
  const calls = []
  const agent = new DshWebAcpAgent({
    history: async (sessionId) => { calls.push(sessionId); return { events: [] } },
  })
  const initialized = await agent.initialize()
  assert.equal(initialized.agentCapabilities.loadSession, true)
  assert.deepEqual(await agent.loadSession({ sessionId: 'session-existing' }), {})
  assert.deepEqual(calls, ['session-existing'])
})

test('ACP maps visible DSH sidebar sessions and hides coordinator sessions', async () => {
  const agent = new DshWebAcpAgent({
    list: async () => ({
      items: [
        { sessionId: 'manual-1', cwd: 'C:\\workspace', updatedAt: 1, running: false, projections: { values: { title: '登录页开发' } } },
        { sessionId: 'child-1', cwd: 'C:\\workspace', updatedAt: 2, running: true, origin: 'subagent', projections: { values: { title: 'generic', subagent: { label: '代码审查' } } } },
        { sessionId: 'coordinator-1', cwd: 'C:\\workspace', updatedAt: 3, projections: { values: { title: '<qwen_audio_agent_backend_instructions>' } } },
      ],
    }),
  })
  const result = await agent.listSessions({ cwd: 'C:\\workspace' })
  assert.deepEqual(result.sessions.map(item => [item.sessionId, item.title]), [
    ['manual-1', '登录页开发'],
    ['child-1', '代码审查'],
  ])
})
