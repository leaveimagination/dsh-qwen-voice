export interface VoiceMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    turnId?: string;
    responseId?: string;
    taskId?: string;
    taskIds?: string[];
    origin?: string;
    deliverySequence?: number;
    live?: boolean;
    final?: boolean;
    interrupted?: boolean;
    title?: string;
}
export declare function insertByTurn(items: VoiceMessage[], message: VoiceMessage): VoiceMessage[];
export declare function upsertUserTranscript(items: VoiceMessage[], input: Pick<VoiceMessage, 'id' | 'content' | 'turnId'> & {
    final?: boolean;
}): VoiceMessage[];
export declare function discardUserTranscript(items: VoiceMessage[], turnId?: string): VoiceMessage[];
export declare function upsertAssistantTranscript(items: VoiceMessage[], message: VoiceMessage, replace?: boolean): VoiceMessage[];
