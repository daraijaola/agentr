export async function textToSpeech(_text: string): Promise<Buffer> { return Buffer.alloc(0) }
export async function synthesize(_text: string): Promise<Buffer> { return Buffer.alloc(0) }
export const ttsService = { synthesize: async (_text: string): Promise<Buffer> => Buffer.alloc(0) }
export async function generateSpeech(_text: string, _voice?: string): Promise<Buffer> { return Buffer.alloc(0) }
export const EDGE_VOICES: string[] = []
export const PIPER_VOICES: string[] = []
export type TTSProvider = "edge" | "piper" | "none"
