import type { TranslationResult } from '../../shared/types';

export interface TranslatorAdapter {
  id: string;
  name: string;
  requiresApiKey: boolean;
  translate(
    text: string, from: string, to: string, apiKey?: string
  ): Promise<TranslationResult>;
  /** 返回 TTS 音频 URL，不支持则返回 null */
  tts?(text: string, lang: string): string | null;
}
