let cachedVoice: SpeechSynthesisVoice | null = null;

// 优先挑更自然的英文发音（Google / Samantha / 系统增强版等）
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  if (cachedVoice && cachedVoice.lang.startsWith(lang.slice(0, 2))) return cachedVoice;
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
  if (!voices.length) return null;
  const preferred = ['Google US English', 'Samantha', 'Ava', 'Allison', 'Microsoft Aria', 'Microsoft Jenny'];
  for (const name of preferred) {
    const hit = voices.find(v => v.name.includes(name));
    if (hit) return (cachedVoice = hit);
  }
  const exact = voices.find(v => v.lang.replace('_', '-') === lang);
  return (cachedVoice = exact || voices[0]);
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
  };
}

export function speak(text: string, lang: string = 'en-US', rate: number = 1) {
  if (!window.speechSynthesis) return;
  const utter = new window.SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const voice = pickVoice(lang);
  if (voice) utter.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}
