// 语言代码到 chrome.tts 语言的映射
const LANG_TTS_MAP: Record<string, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

export async function speak(text: string, lang: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ttsLang = LANG_TTS_MAP[lang] || lang;

    // 使用 chrome.tts 引擎朗读
    // 如果语言不支持 TTS，则返回 false
    try {
      chrome.tts.speak(text, {
        lang: ttsLang,
        rate: 1.0,
        onEvent: (event) => {
          if (event.type === 'end') resolve(true);
          // 被后续 speak() 打断或取消时，也要 resolve，否则等待方永久挂起
          if (event.type === 'interrupted' || event.type === 'cancelled') resolve(false);
          if (event.type === 'error') {
            console.warn('[TTS] chrome.tts failed:', event.errorMessage ?? 'unknown error');
            resolve(false);
          }
        },
      });
    } catch (err) {
      // chrome.tts.speak 同步抛出（缺少权限 / 不支持的语言等）
      console.warn('[TTS] chrome.tts.speak threw synchronously:', err);
      resolve(false);
    }
  });
}
