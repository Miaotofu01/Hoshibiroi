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
  "encyclopedia": "用大白话写的通俗解释（3-5 句）：第一句用日常语言说清它是什么；中间给一个生活中的具体类比或场景例子（做饭/开车/上学/购物等）；最后一句说它为什么重要或在哪里会遇到。禁止词典式定义"
}

Rules:
- First classify the input into ONE type:
  · WORD — a single common word (e.g. dog, run, beautiful)
  · PHRASE — a short fixed expression or collocation (e.g. break the ice, cutting-edge)
  · TERM — a technical term, proper noun, abbreviation or jargon with specialized meaning (e.g. transformer, ADHD, DNA, Git)
  · TEXT — a complete sentence or longer passage
- Then include ONLY the fields that fit the type — decide yourself, omit everything else:
  · WORD: phonetic, lemma, partsOfSpeech, inflections, synonyms, antonyms, collocations, wordRoot, register, usageNote, memoryTip, examples
  · PHRASE: partsOfSpeech (optional), register, usageNote, examples, memoryTip — NEVER wordRoot, inflections, synonyms, antonyms, collocations, lemma
  · TERM: encyclopedia, register (optional), usageNote (optional), examples (optional) — NEVER wordRoot, inflections, synonyms, antonyms, collocations, lemma, memoryTip
  · TEXT: text only; usageNote only if grammar or wording is genuinely tricky; NEVER any word-level field
- encyclopedia rules:
  1. write for someone with NO background in the field — imagine explaining to a smart 12-year-old
  2. FORBIDDEN: dictionary definitions, jargon chains, opening with "X是……的一种技术/方法/概念"
  3. REQUIRED: one concrete everyday analogy or scenario example (cooking, driving, school, shopping…)
  4. end with why it matters or where you meet it
- Follow this style for encyclopedia (illustrative example for "static checking"):
  "程序不用真的跑起来就能检查代码对不对，就像写作文前先过一遍语法检查。比如你写 x = 'hello'，后面又拿 x 做加法，它会在运行前提醒你类型对不上。所以写代码时能第一时间发现低级错误，是代码质量的第一道防线。"
- "text" is always required; all other fields are optional — omit what does not apply
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
