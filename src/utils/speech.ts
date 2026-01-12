export function speak(text: string, lang: string = 'en-US', rate: number = 1) {
  if (!window.speechSynthesis) return;
  const utter = new window.SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}
