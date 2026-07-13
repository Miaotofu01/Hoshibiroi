import type { GrammarAnalysis } from '../shared/types';
import { getSettings } from './storage';

/**
 * 用 DeepSeek 做句子语法解析。只走 DeepSeek（唯一个能做语法分析的源）。
 * 返回结构化的 GrammarAnalysis。
 */
export async function analyzeGrammar(text: string, lang: string, detail: 'brief' | 'full' = 'brief'): Promise<GrammarAnalysis> {
  const { translators } = await getSettings();
  const ds = translators.find(t => t.id === 'deepseek' && t.enabled && t.apiKey);
  if (!ds) throw new Error('语法分析需要启用并配置 DeepSeek 翻译源');

  const langName = lang === 'zh' ? 'Chinese' : lang === 'en' ? 'English' : lang;

  const briefPrompt = `Analyze the following ${langName} sentence. Return ONLY a JSON object (no markdown, no extra text):
{
  "structure": "overall sentence structure and clause types explained in Chinese (1-2 sentences)",
  "tokens": [],
  "grammarPoints": ["the 2-4 most important grammar rules used in this sentence, explained concisely in Chinese"]
}

Sentence: "${text}"
Important: Return ONLY valid JSON. structure and grammarPoints in Chinese. tokens array MUST be empty.`;

  const fullPrompt = `Analyze the following ${langName} sentence grammatically. Return ONLY a JSON object (no markdown, no extra text):
{
  "structure": "overall sentence structure explained in Chinese, including clause types and sentence pattern",
  "tokens": [
    {"word": "original word", "pos": "part of speech", "lemma": "base form", "role": "grammatical role in sentence"}
  ],
  "grammarPoints": ["key grammar rule or pattern used in this sentence, explained in Chinese"]
}

Sentence: "${text}"

Important:
- Explain structure and grammarPoints in Chinese
- pos should be in English (noun/verb/adj/adv/prep/conj/pron/det/aux/particle/etc)
- role should be in Chinese (主语/谓语/宾语/定语/状语/补语/系词/连接词/etc)
- If the sentence has multiple clauses, analyze each clause
- Return ONLY valid JSON, no other text`;

  const prompt = detail === 'brief' ? briefPrompt : fullPrompt;

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ds.apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a grammar analysis assistant. Always respond with ONLY valid JSON, no markdown fences, no extra explanation.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 未返回语法分析结果');

  // 尝试解析 JSON（DeepSeek 可能包在 ```json ... ``` 里）
  let jsonStr = content.trim();
  const m = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) jsonStr = m[1].trim();

  try {
    const parsed = JSON.parse(jsonStr) as GrammarAnalysis;
    if (!parsed.structure || !Array.isArray(parsed.tokens) || !Array.isArray(parsed.grammarPoints)) {
      throw new Error('返回数据格式不完整');
    }
    return parsed;
  } catch (e) {
    throw new Error(`语法分析 JSON 解析失败: ${(e as Error).message}`);
  }
}
