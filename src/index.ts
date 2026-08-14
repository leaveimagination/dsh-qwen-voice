import type { Context } from '@deepseek-ai/cordis'

export const name = 'qwen-voice'

/** Client-only entry; the host fiber exists so the bundle can join a profile. */
export function apply(_ctx: Context): void {}
