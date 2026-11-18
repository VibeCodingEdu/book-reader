// בחירת קול הקראה (Google TTS) ושמיעת דוגמה. הרשימה נטענת כשפותחים את ההגדרות.
// הדוגמה גם בודקת שזמני המילים חוזרים מלאים (הבסיס לסימון מילה-מילה בהקראה).

import { useEffect, useRef, useState } from 'preact/hooks';
import { friendlyError, getTtsSample, getTtsVoices, type TtsVoice } from './api';
import { Icon } from './Icon';

const SAMPLE = 'Once upon a time there were four little Rabbits, and their names were Flopsy, Mopsy, Cotton-tail, and Peter.';
const GENDER: Record<string, string> = { MALE: 'גבר', FEMALE: 'אישה' };
const ACCENT: Record<string, string> = { 'en-US': 'אמריקאי', 'en-GB': 'בריטי' };
const TYPE: Record<string, string> = { Wavenet: 'WaveNet', Neural2: 'Neural2' };

/** "אישה · אמריקאי · Neural2" (בלי הרשימה, מפענחים מהשם: en-US-Neural2-A) */
function describe(name: string, voices: TtsVoice[] | null): string {
  const v = voices?.find((x) => x.name === name);
  const m = /^([a-z]{2,3}-[A-Z]{2})-(Wavenet|Neural2)-([A-Z])$/.exec(name);
  if (!m) return name;
  return [v ? GENDER[v.gender] : null, ACCENT[m[1]] ?? m[1], `${TYPE[m[2]]} ${m[3]}`].filter(Boolean).join(' · ');
}

export function VoicePicker({ voice, onChange }: { voice: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    getTtsVoices()
      .then(setVoices)
      .catch((e) => setError(friendlyError(e)));
    return () => audio.current?.pause();
  }, []);

  const play = async () => {
    if (!voice) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await getTtsSample(voice, SAMPLE);
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      audio.current?.pause();
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
      const ok = r.check.missing.length === 0;
      setInfo({ ok, text: ok ? 'הקול תומך בסימון מילה-מילה' : `חסרים סימונים (${r.check.returned} מתוך ${r.check.sent}): הקול לא מתאים לסימון מילה-מילה` });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // קבוצות לפי מבטא וסוג קול
  const groups = new Map<string, TtsVoice[]>();
  for (const v of voices ?? []) {
    const key = `${ACCENT[v.language] ?? v.language} · ${TYPE[v.type]}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return (
    <div class="voice-picker">
      <div class="voice-current">
        <span class="voice-icon" aria-hidden="true">
          <Icon name="headphones" size={22} />
        </span>
        <div class="voice-current-text">
          <span class="voice-current-name">{voice ? describe(voice, voices) : 'עוד לא נבחר קול'}</span>
          {voice && <span class="muted small en" lang="en" dir="ltr">{voice}</span>}
        </div>
      </div>

      {voices && (
        <label class="voice-select">
          <span class="visually-hidden">בחירת קול</span>
          <select value={voice} onChange={(e) => onChange(e.currentTarget.value)}>
            <option value="">בחירת קול…</option>
            {[...groups.entries()].map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((v) => (
                  <option key={v.name} value={v.name}>
                    {GENDER[v.gender] ?? v.gender} · {v.name.slice(-1)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {!voices && !error && <p class="set-note">טוען קולות…</p>}

      <button class="secondary voice-play" disabled={!voice || busy || !voices} onClick={play}>
        <Icon name="play" size={18} />
        {busy ? 'מכין דוגמה…' : 'שמיעת דוגמה'}
      </button>
      {info && <p class={`set-note ${info.ok ? 'ok' : 'bad'}`}>{info.ok ? '✓ ' : ''}{info.text}</p>}
      {error && <p class="set-note bad">{error}</p>}
    </div>
  );
}
