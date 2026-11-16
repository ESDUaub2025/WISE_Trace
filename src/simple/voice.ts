// Read-aloud and the small "it worked" signals. Both follow the settings and fail silently on phones without support.
import type { Settings } from './settings';

export function canSpeak(voice: Settings['voice'], clip?: string) {
  if (voice.mode === 'off') return false;
  return (
    (voice.mode === 'recorded' && !!clip && !!voice.clips[clip]) ||
    (typeof window !== 'undefined' && 'speechSynthesis' in window)
  );
}

/** Plays the recorded clip for this screen when there is one, otherwise the phone's own voice. */
export function speak(text: string, language: string, voice: Settings['voice'], clip?: string) {
  if (voice.mode === 'off') return;
  const url = voice.mode === 'recorded' && clip ? voice.clips[clip] : undefined;
  if (url) {
    void new Audio(url).play().catch(() => undefined);
    return;
  }
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'ar' ? 'ar' : 'en';
  utterance.rate = 0.9;
  const match = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(utterance.lang));
  if (match) utterance.voice = match;
  window.speechSynthesis.speak(utterance);
}

/** A short vibration and a two-note chime after something is saved. */
export function celebrate(feedback: Settings['feedback']) {
  try {
    if (feedback.vibrate && 'vibrate' in navigator) navigator.vibrate([40, 40, 60]);
  } catch {
    /* vibration is optional */
  }
  if (!feedback.sound) return;
  try {
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    for (const [index, frequency] of [660, 880].entries()) {
      const tone = audio.createOscillator(),
        gain = audio.createGain();
      const start = audio.currentTime + index * 0.13;
      tone.frequency.value = frequency;
      tone.type = 'sine';
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.25);
    }
    setTimeout(() => void audio.close(), 800);
  } catch {
    /* sound is optional */
  }
}
