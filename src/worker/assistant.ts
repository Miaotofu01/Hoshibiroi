import type { AssistantStats, AssistantThinking } from '../shared/types';
import type { AssistantStreamEvent } from '../shared/messages';
import { API_MESSAGE_MAX_CHARS, estimateTokens, type ApiMessage } from '../shared/assistant';
import { DEEPSEEK_MODEL } from './deepseek-model';

/** 助手用的模型名（对外保留这个名字，实际取值集中在 deepseek-model.ts） */
export const ASSISTANT_MODEL = DEEPSEEK_MODEL;
const ENDPOINT = 'https://api.deepseek.com/chat/completions';

/** 空闲超时：思考模式下首个数据块可能很晚才来，按「多久没数据」而不是总时长计时 */
export const IDLE_TIMEOUT_MS = 60_000;

/** 思考深度额外 token 预算：max_tokens 是输出总量上限，思考会吃掉一部分 */
export function reasoningBudget(thinking: AssistantThinking): number {
  return thinking === 'low' ? 1500 : thinking === 'high' ? 3000 : thinking === 'max' ? 6000 : 0;
}

export interface AssistantRequest {
  apiKey: string;
  messages: ApiMessage[];
  thinking: AssistantThinking;
  maxTokens: number;
  signal?: AbortSignal;
}

/**
 * worker 只产出这三种事件，端口协议里还包含 error/ping（由 handler 生成）。
 * 事件形状以 shared/messages.ts 的 AssistantStreamEvent 为唯一来源，避免两处定义漂移。
 */
export type AssistantEvent = Extract<AssistantStreamEvent, { kind: 'reasoning' | 'answer' | 'done' }>;

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface RawSSEDelta {
  content: string;
  reasoning: string;
  finishReason?: string;
  usage?: RawUsage | null;
  done: boolean;
}

export function buildAssistantBody(req: AssistantRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: ASSISTANT_MODEL,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: req.maxTokens + reasoningBudget(req.thinking),
    thinking: { type: req.thinking === 'off' ? 'disabled' : 'enabled' },
  };
  if (req.thinking === 'off') body.temperature = 0.3;   // 思考模式下该参数被忽略，只在关闭时设
  else body.reasoning_effort = req.thinking;
  return body;
}

/** 把 SSE 字节流解析成增量块：处理跨 read() 切断的行、心跳注释行与 [DONE] */
export async function* iterateSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<RawSSEDelta> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line) continue;                    // 事件分隔的空行：没有数据，也不代表连接还活着
        // 非 data 行（注释心跳 ": keep-alive"、event:/id: 等）也要产出一次空增量：
        // 上层是按「有没有增量」重置空闲计时的，只被注释保活的流会在 60s 被误判成超时。
        if (!line.startsWith('data:')) { yield { content: '', reasoning: '', done: false }; continue; }
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { yield { content: '', reasoning: '', done: true }; return; }
        let json: {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }>;
          usage?: RawUsage | null;
        };
        try { json = JSON.parse(payload); } catch { continue; }   // 半行或非 JSON 心跳
        const choice = json.choices?.[0];
        yield {
          content: choice?.delta?.content ?? '',
          reasoning: choice?.delta?.reasoning_content ?? '',
          finishReason: choice?.finish_reason ?? undefined,
          usage: json.usage ?? null,
          done: false,
        };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 流式对话：产出 reasoning/answer 增量，最后产出 done（含用量统计） */
export async function* streamAssistant(req: AssistantRequest): AsyncGenerator<AssistantEvent> {
  // 硬上限：异常输入（整页正文重复注入、历史没裁干净）在发请求前就拒绝，
  // 否则会白白计费一次注定被服务端拒绝的调用
  const totalChars = req.messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > API_MESSAGE_MAX_CHARS) {
    throw new Error(`请求内容过大（${totalChars} 字，上限 ${API_MESSAGE_MAX_CHARS}），请缩短上下文长度或清空对话`);
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  req.signal?.addEventListener('abort', onAbort);
  if (req.signal?.aborted) ctrl.abort();   // 调用前就已中止的信号不会再派发 abort 事件，必须补查一次

  let idle: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT_MS);
  };
  armIdle();

  const stats: AssistantStats = { elapsedMs: 0, promptTokens: 0, cachedTokens: 0, answerTokens: 0, reasoningTokens: 0 };
  let answerText = '';
  let reasoningText = '';
  let finishReason: string | undefined;
  let sawDone = false;

  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify(buildAssistantBody(req)),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${resp.status}`);
    }
    if (!resp.body) throw new Error('DeepSeek 未返回流式响应体');

    for await (const d of iterateSSE(resp.body)) {
      armIdle();
      if (d.finishReason) finishReason = d.finishReason;
      if (d.reasoning) { reasoningText += d.reasoning; yield { kind: 'reasoning', text: d.reasoning }; }
      if (d.content) { answerText += d.content; yield { kind: 'answer', text: d.content }; }
      if (d.usage) {
        stats.promptTokens = d.usage.prompt_tokens ?? 0;
        stats.cachedTokens = d.usage.prompt_cache_hit_tokens ?? 0;
        stats.answerTokens = d.usage.completion_tokens ?? 0;
        stats.reasoningTokens = d.usage.completion_tokens_details?.reasoning_tokens ?? 0;
      }
      if (d.done) { sawDone = true; break; }
    }
  } catch (err) {
    if (req.signal?.aborted) throw err;                       // 用户主动停止：交给上层判定
    if ((err as Error)?.name === 'AbortError') throw new Error(`等待响应超时（${IDLE_TIMEOUT_MS / 1000} 秒内没有新内容）`);
    throw err;
  } finally {
    if (idle) clearTimeout(idle);
    req.signal?.removeEventListener('abort', onAbort);
  }

  // usage 缺失时用估算兜底，UI 脚注不会显示 0
  if (!stats.answerTokens) stats.answerTokens = estimateTokens(answerText + reasoningText);
  if (!stats.reasoningTokens) stats.reasoningTokens = estimateTokens(reasoningText);
  stats.elapsedMs = Date.now() - started;
  if (!sawDone) finishReason = finishReason ?? 'incomplete';
  yield { kind: 'done', stats, finishReason };
}
