import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

const SYSTEM_PROMPT = `You are a professional translator and language teacher. Translate the given text and return a JSON breakdown.

Only "text" is required; all other fields are optional — omit any that does not apply:
{
  "text": "translated text",
  "phonetic": "IPA, English words only",
  "lemma": "base form lowercase: dogs→dog; omit for phrases/sentences",
  "partsOfSpeech": [{"type": "n.", "meanings": ["..."]}],
  "examples": [{"original": "...", "translated": "..."}],
  "inflections": ["plural: dogs"],
  "synonyms": ["..."], "antonyms": ["..."],
  "collocations": [{"pattern": "make a decision", "meaning": "做决定"}],
  "wordRoot": "词根词缀解析",
  "register": "正式/口语/书面/俚语",
  "usageNote": "易混词辨析或用法注意，一两句",
  "memoryTip": "记忆技巧，一两句",
  "encyclopedia": "专业定义式解释（3-5 句）：先给准确定义，可补充相对概念、技术例子、场景意义；类比仅自然时用，不要硬凑"
}

Classify the input first, then include ONLY fields that fit its type:
· WORD (single word: dog, run): phonetic, lemma, partsOfSpeech, inflections, synonyms, antonyms, collocations, wordRoot, register, usageNote, memoryTip, examples
· PHRASE (fixed expression: break the ice): partsOfSpeech(opt), register, usageNote, examples, memoryTip — NEVER wordRoot/inflections/synonyms/antonyms/collocations/lemma
· TERM (technical term/abbreviation: transformer, ADHD): encyclopedia, register(opt), usageNote(opt), examples(opt) — NEVER wordRoot/inflections/synonyms/antonyms/collocations/lemma/memoryTip
· TEXT (sentence/passage): text only; usageNote only if tricky — NEVER word-level fields

encyclopedia: lead with a precise definition; contrast with related concept and concrete technical examples help; analogy optional, never forced.
Example for "static checking": 静态检查（static checking）指在不运行程序的情况下，由编译器或分析工具对源代码进行检查，与动态检查相对。它能发现类型不匹配、未定义变量、语法错误等编译期问题，是代码质量保障的第一道防线，常见于编译与集成阶段。

Keep every string concise.`;

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
