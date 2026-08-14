/** Resample browser microphone PCM for the Qwen realtime gateway. */
export declare function resample(input: Float32Array, from: number, to: number): Float32Array;
/** Encode signed 16-bit little-endian PCM as base64. */
export declare function pcmBase64(samples: Float32Array): string;
/** Decode gateway PCM playback audio to browser floats. */
export declare function decodePcm(base64: string): Float32Array;
