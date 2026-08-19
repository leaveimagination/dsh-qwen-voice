import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Regression guard for the 2026-08-19 14:44 cancellation deadlock: the DSH
// coordinator is a native DSH Session, so ACP's activeCoordinatorTurns never
// contains it and `busy` is always false. The old code then drove a fresh
// coordinator turn via coordinatorControl() to perform the cancellation the
// coordinator itself was already executing - a self-recursive deadlock that
// hung the cancel tool ~58s and froze the plugin ~14 minutes.
test('cancellation never re-drives the coordinator (deadlock guard)', () => {
  const adapter = fs.readFileSync(
    path.join(root, 'node_modules', 'qwen-audio-agent', 'server', 'src', 'agent', 'acp-backend-adapter.mjs'),
    'utf8',
  )
  // The deadlock branch must be explicitly disabled for the DSH integration.
  assert.match(adapter, /if \(false && !busy\)/)
  assert.match(adapter, /self-recursive deadlock that froze/)
  // Cancellation must always reach the ACP direct-cancel transport.
  assert.match(adapter, /await this\.cancelDelegation\(\{ delegation_id: record\.id \}\)/)
})

test('cancellation timeout guard is wired in the DSH coordinator tools', () => {
  const tools = fs.readFileSync(
    path.join(root, '..', 'dsh-qwen-coordinator-tools', 'src', 'index.ts'),
    'utf8',
  )
  assert.match(tools, /QWEN_COORDINATOR_TOOL_TIMEOUT_MS/)
  assert.match(tools, /Gateway request timed out/)
  // Gateway failures must be returned as readable JSON, never swallowed.
  assert.match(tools, /QWEN_GATEWAY_REQUEST_ERROR/)
})
