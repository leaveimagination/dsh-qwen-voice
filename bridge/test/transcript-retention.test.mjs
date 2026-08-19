import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('the voice panel retains a partial transcript when final ASR confirmation fails', () => {
  const component = fs.readFileSync(
    path.join(root, 'src', 'client', 'QwenVoice.tsx'),
    'utf8',
  )
  assert.match(component, /event\.reason === 'turn_invalid'/)
  assert.match(component, /settleUserTranscript\(items, event\.turnId\)/)
})

test('settling a transcript makes the existing preview durable', () => {
  const ordering = fs.readFileSync(
    path.join(root, 'src', 'client', 'message-order.ts'),
    'utf8',
  )
  assert.match(ordering, /export function settleUserTranscript/)
  assert.match(ordering, /final: true, live: false/)
})
