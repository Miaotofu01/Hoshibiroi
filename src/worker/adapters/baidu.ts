import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';
import { md5 } from '../md5';

export const baiduTranslator: TranslatorAdapter = {
  id: 'baidu',
  name: '百度翻译',
  requiresApiKey: true,

  async translate(text: string, from: string, to: string, apiKey?: string): Promise<TranslationResult> {
    if (!apiKey) throw new Error('百度翻译 API key 未配置');
    // apiKey 格式: "appId|secretKey"
    const [appId, secretKey] = apiKey.split('|');
    if (!appId || !secretKey) throw new Error('百度翻译 API key 格式错误，需为 appId|secretKey');

    const salt = Math.random().toString(36).slice(2);
    const signStr = appId + text + salt + secretKey;
    const sign = md5(signStr);

    const langMap: Record<string, string> = { auto: 'auto', zh: 'zh', en: 'en', ja: 'jp', ko: 'kor', fr: 'fra', de: 'de', es: 'spa' };
    const params = new URLSearchParams({
      q: text,
      from: langMap[from] ?? 'auto',
      to: langMap[to] ?? 'zh',
      appid: appId,
      salt,
      sign,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch('https://api.fanyi.baidu.com/api/trans/vip/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      });
      const data = await resp.json();
      if (data.error_code) {
        throw new Error(`百度翻译错误: ${data.error_msg}`);
      }
      const translated = data.trans_result?.map((r: { dst: string }) => r.dst).join('\n') ?? text;
      return {
        text: translated,
        source: '百度翻译',
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};
