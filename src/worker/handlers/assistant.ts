import type {
  AskAssistantRequest, AssistantStreamEvent, AssistantStreamRequest,
} from '../../shared/messages';
import { streamAssistant, askAssistant } from '../assistant';
import { getSettings } from '../storage';

const EMPTY_STATS = { elapsedMs: 0, promptTokens: 0, cachedTokens: 0, answerTokens: 0, reasoningTokens: 0 };

/** 助手复用 DeepSeek 翻译源的 Key（助手需要具备对话能力的源，只有 DeepSeek 满足） */
async function resolveApiKey(): Promise<string> {
  const { translators } = await getSettings();
  const ds = translators.find(t => t.id === 'deepseek' && t.enabled && t.apiKey);
  if (!ds?.apiKey) throw new Error('助手需要 DeepSeek API Key：请在设置里启用 DeepSeek 并填入 Key');
  return ds.apiKey;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown): boolean {
  return (err as Error)?.name === 'AbortError';
}

/** 非流式兜底：content 在端口不可用时可退回到 sendMessage */
export async function handleAskAssistant(req: AskAssistantRequest) {
  try {
    const apiKey = await resolveApiKey();
    const out = await askAssistant({
      apiKey,
      messages: req.payload.messages,
      thinking: req.payload.thinking,
      maxTokens: req.payload.maxTokens,
    });
    return { type: 'ASSISTANT_RESULT' as const, ...out };
  } catch (err) {
    return { type: 'ASSISTANT_ERROR' as const, error: errorMessage(err) };
  }
}

/**
 * 端口流式 runner。
 * 心跳：MV3 Service Worker 空闲 30s 会被回收，思考阶段可能长时间没有数据块，
 * 每 20s 发一次 ping（Chrome 116+ 端口活动会重置空闲计时器），content 回 pong 更稳。
 * 中止：新 ask 会取代旧请求（旧请求静默收尾，见 catch）；abort 消息与端口断开只中止当前请求。
 */
export function registerAssistantPort(port: chrome.runtime.Port): void {
  let controller: AbortController | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const send = (ev: AssistantStreamEvent) => {
    try { port.postMessage(ev); } catch { /* 端口已断开，忽略 */ }
  };
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };

  port.onMessage.addListener((msg: AssistantStreamRequest) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'pong') return;
    if (msg.kind === 'abort') { controller?.abort(); return; }
    if (msg.kind !== 'ask') return;

    controller?.abort();               // 同一端口同时只跑一个请求
    const ac = new AbortController();
    controller = ac;
    stopHeartbeat();
    // 记下本次请求的心跳句柄：旧请求被取代后其收尾不能误清新请求的心跳
    const timer = setInterval(() => send({ kind: 'ping' }), 20_000);
    heartbeat = timer;

    void (async () => {
      try {
        const apiKey = await resolveApiKey();
        for await (const ev of streamAssistant({
          apiKey,
          messages: msg.payload.messages,
          thinking: msg.payload.thinking,
          maxTokens: msg.payload.maxTokens,
          signal: ac.signal,
        })) {
          send(ev);
          if (ev.kind === 'done') break;
        }
      } catch (err) {
        if (isAbort(err) || ac.signal.aborted) {
          // 只有仍是当前请求才补一条 aborted done：被新 ask 取代的请求保持静默——
          // 新请求本就会重置 content 侧状态，而这条迟到的终止事件与新一轮的 done 无法区分
          // （旧请求可能停在 resolveApiKey() 上，其 done 甚至会落在新流开始之后），会被当成新一轮结束。
          // 用户主动 abort 不替换 controller，依旧走这里；端口断开时 send 本就被吞掉，无需额外分支。
          if (controller === ac) send({ kind: 'done', stats: EMPTY_STATS, aborted: true });
        } else {
          send({ kind: 'error', message: errorMessage(err) });
        }
      } finally {
        if (heartbeat === timer) stopHeartbeat();
        if (controller === ac) controller = null;
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    controller?.abort();
    stopHeartbeat();
  });
}
