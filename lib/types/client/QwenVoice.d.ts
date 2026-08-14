import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
type VoiceProps = PropsRuntime<'shell.overlay'> & {
    openSession(sessionId: string): void;
};
/** Qwen Audio Agent control mounted beside the DSH send action. */
export declare function QwenVoice(props: VoiceProps): React.JSX.Element;
export {};
