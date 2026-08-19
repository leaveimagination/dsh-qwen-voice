import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DSH_COORDINATOR_BINDING_PATH = process.env.QWEN_COORDINATOR_BINDING_PATH
  ? path.resolve(process.env.QWEN_COORDINATOR_BINDING_PATH)
  : path.join(
      process.env.QWAUDIO_CONFIG_DIR || path.join(os.homedir(), '.config', 'qwaudio'),
      'dsh-coordinator.json',
    )

export function readDshCoordinatorBinding() {
  try {
    const value = JSON.parse(fs.readFileSync(DSH_COORDINATOR_BINDING_PATH, 'utf8'))
    const sessionId = String(value?.sessionId || '').trim()
    const cwd = String(value?.cwd || '').trim()
    if (value?.version !== 1 || !/^session-[0-9a-f-]{36}$/i.test(sessionId) || !cwd) {
      return null
    }
    return { sessionId, cwd }
  } catch {
    return null
  }
}

export function writeDshCoordinatorBinding({ sessionId, cwd }) {
  const value = {
    version: 1,
    sessionId: String(sessionId),
    cwd: String(cwd),
    updatedAt: Date.now(),
  }
  fs.mkdirSync(path.dirname(DSH_COORDINATOR_BINDING_PATH), { recursive: true })
  const temporary = `${DSH_COORDINATOR_BINDING_PATH}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  fs.renameSync(temporary, DSH_COORDINATOR_BINDING_PATH)
  return value
}

export function clearDshCoordinatorBinding() {
  try {
    fs.unlinkSync(DSH_COORDINATOR_BINDING_PATH)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}
