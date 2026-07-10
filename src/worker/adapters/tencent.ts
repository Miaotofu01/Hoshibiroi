import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

// 简易 SHA256 + HMAC 的浏览器兼容实现
// 使用 Web Crypto API
async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function signV3(secretId: string, secretKey: string, payload: string): Promise<{
  headers: Record<string, string>;
}> {
  const host = 'tmt.tencentcloudapi.com';
  const service = 'tmt';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const algorithm = 'TC3-HMAC-SHA256';

  const hashedPayload = await sha256Hex(payload);
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQuerystring = '';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    httpRequestMethod, canonicalUri, canonicalQuerystring,
    canonicalHeaders, signedHeaders, hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [algorithm, timestamp.toString(), credentialScope, hashedCanonicalRequest].join('\n');

  const secretDate = await hmacSha256(
    new TextEncoder().encode(`TC3${secretKey}`), date
  );
  const secretService = await hmacSha256(secretDate, service);
  const secretSigning = await hmacSha256(secretService, 'tc3_request');
  const signature = Array.from(
    new Uint8Array(await hmacSha256(secretSigning, stringToSign))
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Action': 'TextTranslate',
      'X-TC-Version': '2018-03-21',
      'X-TC-Region': 'ap-guangzhou',
    },
  };
}

export const tencentTranslator: TranslatorAdapter = {
  id: 'tencent',
  name: '腾讯云 TMT',
  requiresApiKey: true,

  async translate(text: string, from: string, to: string, apiKey?: string): Promise<TranslationResult> {
    if (!apiKey) throw new Error('腾讯云 API key 未配置');
    // apiKey 格式: "SecretId|SecretKey"
    const [secretId, secretKey] = apiKey.split('|');
    if (!secretId || !secretKey) throw new Error('腾讯云 API key 格式错误，需为 SecretId|SecretKey');

    const srcLangMap: Record<string, string> = { auto: 'auto', zh: 'zh', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', es: 'es' };
    const payload = JSON.stringify({
      SourceText: text,
      Source: srcLangMap[from] ?? 'auto',
      Target: srcLangMap[to] ?? 'zh',
      ProjectId: 0,
    });

    const { headers } = await signV3(secretId, secretKey, payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch('https://tmt.tencentcloudapi.com/', {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });
      const data = await resp.json();
      if (data.Response?.Error) {
        throw new Error(data.Response.Error.Message);
      }
      return {
        text: data.Response?.TargetText ?? text,
        source: '腾讯云 TMT',
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};
