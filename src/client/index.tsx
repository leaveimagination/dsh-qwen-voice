import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { QwenVoice } from './QwenVoice.tsx'

export const inject = ['slots']

/** Register one root-scoped voice orb that survives conversation switches. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'qwen-voice',
    order: 900,
    label: 'Qwen Voice',
  }, props => <QwenVoice {...props} openSession={sessionId => ctx.sessions.open(sessionId as Parameters<typeof ctx.sessions.open>[0])} />))
}
