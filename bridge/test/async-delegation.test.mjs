import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('managed DSH delegation returns before target Session completion', () => {
  const method = fs.readFileSync(
    path.join(root, 'scripts', 'overlays', 'managed-project-session-method.mjs.txt'),
    'utf8',
  )
  assert.match(method, /managedCoordinatorRuns\.get\(runId\)/)
  assert.doesNotMatch(method, /^\s*const result = await record\.promise/m)
  assert.match(method, /runCoordinator\(\) owns that promise/)
})

test('DSH Session API reports started without embedding a final result', () => {
  const api = fs.readFileSync(
    path.join(root, 'scripts', 'overlays', 'dsh-session-api.mjs'),
    'utf8',
  )
  assert.match(api, /status: 'started'/)
  assert.doesNotMatch(api, /completed: true/)
  assert.doesNotMatch(api, /result: result\?\.content/)
})
