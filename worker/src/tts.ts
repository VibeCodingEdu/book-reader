// Google Cloud Text-to-Speech: רשימת קולות, והקראה עם זמני מילים (SSML <mark> + enableTimePointing).
// זמני מילים זמינים רק ב-v1beta1. המפתח נשלח בכותרת x-goog-api-key ולא בכתובת.

import type { Timepoint } from '../../shared/tts';

export const GOOGLE_TTS = 'google-tts';
/**
 * מכסת תווים חודשית שעוצרים לפניה. הערכה זהירה: המכסה החינמית של WaveNet היא מיליון או 4 מיליון
 * (מקורות שונים אומרים דברים שונים), ולכן עוצרים ב-900 אלף עד שמאמתים בקונסולה של Google.
 * ניתן לשנות עם המשתנה TTS_MONTHLY_CHARS.
 */
export const DEFAULT_TTS_MONTHLY_CHARS = 900_000;

/** רק קולות WaveNet ו-Neural2 (תומכים בסימונים; Chirp 3 HD כנראה לא) */
const VOICE_RE = /^([a-z]{2,3}-[A-Z]{2})-(Wavenet|Neural2)-[A-Z]$/;

export const isAllowedVoice = (name: string) => VOICE_RE.test(name);
export const voiceLanguage = (name: string) => VOICE_RE.exec(name)?.[1] ?? 'en-US';

export interface VoiceInfo {
  name: string;
  gender: string;
  language: string;
  type: 'Wavenet' | 'Neural2';
}

export async function listVoices(apiKey: string, languages = ['en-US', 'en-GB']): Promise<VoiceInfo[]> {
  const out: VoiceInfo[] = [];
  for (const lang of languages) {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${lang}`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { voices?: { name: string; ssmlGender?: string }[] };
    for (const v of data.voices ?? []) {
      const m = VOICE_RE.exec(v.name);
      if (m) out.push({ name: v.name, gender: v.ssmlGender ?? '', language: m[1], type: m[2] as VoiceInfo['type'] });
    }
  }
  return out.sort((a, b) => a.language.localeCompare(b.language) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export interface Synthesis {
  /** MP3 */
  audio: Uint8Array;
  timepoints: Timepoint[];
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function synthesize(apiKey: string, ssml: string, voice: string, speakingRate = 1): Promise<Synthesis> {
  if (!isAllowedVoice(voice)) throw new Error('קול לא נתמך');
  const res = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: voiceLanguage(voice), name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate },
      enableTimePointing: ['SSML_MARK'],
    }),
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { audioContent?: string; timepoints?: Timepoint[] };
  if (!data.audioContent) throw new Error('Google TTS לא החזיר שמע');
  return { audio: fromBase64(data.audioContent), timepoints: data.timepoints ?? [] };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
