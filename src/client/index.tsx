import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { QwenVoice } from './QwenVoice.tsx'

export const inject = ['slots']

type RefreshableSessions = ClientContext['sessions'] & {
  refresh(): Promise<void>
}

async function openSession(ctx: ClientContext, sessionId: string): Promise<void> {
  const sessions = ctx.sessions as RefreshableSessions
  const id = sessionId as Parameters<typeof ctx.sessions.open>[0]
  if (!sessions.list.getSnapshot().ids.includes(id)) await sessions.refresh()
  sessions.open(id)
}

/** Register one root-scoped voice orb that survives conversation switches. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'qwen-voice',
    order: 900,
    label: 'Qwen Voice',
  }, props => <QwenVoice {...props} openSession={sessionId => openSession(ctx, sessionId)} />))
}
