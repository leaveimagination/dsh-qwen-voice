import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const inject: string[];
/** Register the Qwen voice control immediately before the DSH send button. */
export declare function apply(ctx: ClientContext): void;
