import { QwenVoice } from "./QwenVoice.js";
export const inject = ['slots'];
/** Register the Qwen voice control immediately before the DSH send button. */
export function apply(ctx) {
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'qwen-voice',
        order: 900,
        label: 'Qwen Voice',
    }, QwenVoice));
}
