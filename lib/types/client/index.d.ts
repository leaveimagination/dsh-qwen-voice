import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const inject: string[];
/** Register one root-scoped voice orb that survives conversation switches. */
export declare function apply(ctx: ClientContext): void;
