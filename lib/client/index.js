import { jsx as _jsx } from "react/jsx-runtime";
import { QwenVoice } from "./QwenVoice.js";
export const inject = ['slots'];
/** Register one root-scoped voice orb that survives conversation switches. */
export function apply(ctx) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'qwen-voice',
        order: 900,
        label: 'Qwen Voice',
    }, props => _jsx(QwenVoice, { ...props, openSession: sessionId => ctx.sessions.open(sessionId) })));
}
