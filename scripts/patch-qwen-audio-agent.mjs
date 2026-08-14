#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const globalRoot = execFileSync(npmCommand, ['root', '--global'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}).trim()
const root = path.join(globalRoot, 'qwen-audio-agent')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (pkg.version !== '1.10.0') throw new Error(`Expected qwen-audio-agent 1.10.0, found ${pkg.version}.`)

const replacements = [
  ['server/src/voice/tools/tool-call-handler.mjs', 'laneKey: `coordinator:${this.ownerId}`', 'laneKey: `coordinator:${this.ownerId}:${this.sessionId}:${turnId}`', 'laneKey: `coordinator:${this.ownerId}:${this.sessionId}:${turnId}`'],
  ['server/src/agent/coordinator.mjs', `const run = message => this.client.runCoordinator\n      ? this.client.runCoordinator(message, {\n          ownerId: options.ownerId,`, `const backendOwnerId = options.coordinationRunId\n      ? \`${'${options.ownerId}'}::work::${'${options.coordinationRunId}'}\`\n      : options.sessionId\n        ? \`${'${options.ownerId}'}::voice::${'${options.sessionId}'}\`\n        : options.ownerId\n+    const run = message => this.client.runCoordinator\n      ? this.client.runCoordinator(message, {\n          ownerId: backendOwnerId,`, 'ownerId: backendOwnerId'],
  ['server/src/core/request-security.mjs', `if (configured.includes(origin)) {\n    return originUrl.host === requestHost.host\n  }`, `if (configured.includes(origin)) {\n    // An exact administrator-supplied Origin is trusted across loopback ports.\n    return true\n  }`, 'An exact administrator-supplied Origin'],
]

for (const [relative, from, to, marker] of replacements) {
  const filename = path.join(root, relative)
  const source = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n')
  if (source.includes(marker)) { console.log(`already patched: ${relative}`); continue }
  if (!source.includes(from)) throw new Error(`Unexpected source in ${relative}; refusing to patch.`)
  fs.writeFileSync(filename, source.replace(from, to))
  console.log(`patched: ${relative}`)
}

console.log('Qwen Audio Agent integration patch complete.')
