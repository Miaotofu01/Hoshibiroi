import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

const SYSTEM_PROMPT = `You are a professional translator and language teacher. Translate the given text and provide a detailed breakdown.

Respond in JSON format only:
{
  "text": "translated text",
  "phonetic": "pronunciation in IPA (for English words only, omit for other languages)",
  "lemma": "base form of the word in lowercase: dogs → dog, running → run, Hello → hello; omit for phrases/sentences/non-English words",
  "partsOfSpeech": [{"type": "n.", "meanings": ["meaning1", "meaning2"]}],
  "examples": [{"original": "example sentence", "translated": "翻译"}],
  "inflections": ["plural: dogs", "past tense: walked", "comparative: easier"],
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1"],
  "collocations": [{"pattern": "make a decision", "meaning": "做决定"}],
  "wordRoot": "词根词缀解析，如 \"dict = 说\"，无则省略",
  "register": "语域：正式/口语/书面/俚语（仅形容词短语），无则省略",
  "usageNote": "易混词辨析或用法注意事项，一两句，无则省略",
  "memoryTip": "记忆技巧/联想助记，一两句，无则省略",
  "encyclopedia": "百科式简短解释（中文，1-2 句）"
}

Rules:
- encyclopedia: ONLY for technical terms, proper nouns, abbreviations or jargon that need background knowledge to understand (e.g. Transformer模型, ADHD, 量子纠缠, Git, DNA) — explain what it is in the target language; omit for ordinary words and sentences
- inflections/synonyms/antonyms/collocations: only for English words (or the source language when translating into Chinese); omit for phrases/sentences
- All fields except "text" are optional — omit what does not apply
- Keep every string concise`;

export const deepseekTranslator: TranslatorAdapter = {
  id: 'deepseek',
  name: 'DeepSeek',
  requiresApiKey: true,

  async translate(text: string, from: string, to: string, apiKey?: string): Promise<TranslationResult> {
    if (!apiKey) throw new Error('DeepSeek API key 未配置');

    const langNames: Record<string, string> = {
      auto: '', zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish',
    };
    const fromName = langNames[from] || '';
    const toName = langNames[to] || 'Chinese';
    const direction = fromName ? `from ${fromName} to ${toName}` : `to ${toName}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Translate "${text}" ${direction}` },
          ],
          temperature: 0.3,
          max_tokens: 4096, // 长文本分块可达 2000 字符，输出需要更大预算
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      // 尝试提取 JSON（可能被 markdown code block 包裹）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { text: content.trim(), source: 'DeepSeek' };
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          text: parsed.text ?? content.trim(),
          phonetic: parsed.phonetic,
          lemma: parsed.lemma ? String(parsed.lemma).toLowerCase() : undefined,
          partsOfSpeech: parsed.partsOfSpeech,
          examples: parsed.examples,
          inflections: parsed.inflections,
          synonyms: parsed.synonyms,
          antonyms: parsed.antonyms,
          collocations: parsed.collocations,
          wordRoot: parsed.wordRoot,
          register: parsed.register,
          usageNote: parsed.usageNote,
          memoryTip: parsed.memoryTip,
          encyclopedia: parsed.encyclopedia,
          source: 'DeepSeek',
        };
      } catch {
        return { text: content.trim(), source: 'DeepSeek' };
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};
