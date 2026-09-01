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
  "encyclopedia": "专业定义式解释（3-5 句）：第一句给出准确的定义；随后可补充与之相对/相近的概念、典型技术例子（如数组越界、空指针）、使用场景或意义。生活化类比仅在自然贴切时使用，不要硬凑"
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
  1. lead with a precise professional definition — the definition is the core, keep it exact
  2. often valuable: contrast with the opposite/related concept (e.g. 与静态检查相对) and concrete technical examples (e.g. 数组越界、空指针)
  3. everyday analogy is OPTIONAL — use only if it comes naturally; NEVER force a life template, and never let it replace technical precision
  4. end with where it matters or where you meet it
- Follow this style for encyclopedia (illustrative example for "static checking"):
  "静态检查（static checking）指在不运行程序的情况下，由编译器或分析工具对源代码进行检查，与动态检查相对。它能发现类型不匹配、未定义变量、语法错误等编译期问题，是代码质量保障的第一道防线，常见于编译与集成阶段。"
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
