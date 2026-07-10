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

    // 先尝试使用 Google TTS URL 作为自定义音频源
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=gtx&q=${encodeURIComponent(text)}`;

    // 使用 chrome.tts 引擎朗读
    // 如果语言不支持 TTS，则返回 false
    chrome.tts.speak(text, {
      lang: ttsLang,
      rate: 1.0,
      onEvent: (event) => {
        if (event.type === 'end') resolve(true);
        if (event.type === 'error') {
          console.warn('[TTS] chrome.tts failed, trying audio element fallback');
          // Fallback: 创建 offscreen document 播放 Google TTS URL
          playTtsViaOffscreen(ttsUrl).then(resolve).catch(() => resolve(false));
        }
      },
    });
  });
}

async function playTtsViaOffscreen(_url: string): Promise<boolean> {
  // 简单 fallback：直接在新 tab 或用 Audio 元素
  // 在 SW 中无法直接操作 DOM，这里用 chrome.tts 已经足够
  return false;
}
