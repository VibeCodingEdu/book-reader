import { useEffect, useMemo, useState } from 'preact/hooks';
import { ENGINES } from '../../shared/translate';
import { getSpend, type Session, type Spend } from './api';
import { collectDiagnostics } from './diagnostics';
import type { DeviceSettings, FontFamily, Theme } from './deviceSettings';
import { VoicePicker } from './VoicePicker';
import { Icon } from './Icon';
import { useSheetDrag } from './useSheetDrag';

const FONTS: { id: FontFamily; label: string }[] = [
  { id: 'serif', label: 'Georgia' },
  { id: 'literata', label: 'Literata' },
  { id: 'source-serif', label: 'Source Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'lexend', label: 'Lexend' },
];

const SAMPLE_FALLBACK = 'Once upon a time there were four little Rabbits, and their names were Flopsy, Mopsy, Cotton-tail, and Peter.';

/** טקסט לדוגמה מהספר הפתוח (אם יש): כמה משפטים ראשונים באורך סביר; אחרת משפט קבוע */
function bookSample(): string {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.pages [data-sid], .study-list [data-sid]'));
  const out: string[] = [];
  for (const el of els) {
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t.length >= 40 && t.length <= 220) out.push(t);
    if (out.join(' ').length > 120) break;
  }
  return out.join(' ') || SAMPLE_FALLBACK;
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'אוטומטי' },
  { id: 'light', label: 'בהיר' },
  { id: 'dark', label: 'כהה' },
  { id: 'sepia', label: 'ספיה' },
  { id: 'eink', label: 'E-ink' },
];

interface Props {
  settings: DeviceSettings;
  session: Session;
  onChange: (s: DeviceSettings) => void;
  onClose: () => void;
  onLogout: () => void;
}

function Stepper(props: { label: string; value: string; onDec: () => void; onInc: () => void; decLabel: string; incLabel: string }) {
  return (
    <div class="stepper">
      <span class="stepper-label">{props.label}</span>
      <button class="secondary" aria-label={props.decLabel} onClick={props.onDec}>
        −
      </button>
      <span class="stepper-value" aria-live="polite">
        {props.value}
      </span>
      <button class="secondary" aria-label={props.incLabel} onClick={props.onInc}>
        +
      </button>
    </div>
  );
}

/** "הגדרות לאייפון", ובשם לועזי (Boox) עם מקף: "הגדרות ל-Boox" */
export function settingsTitle(device: string): string {
  const name = device.trim() || 'מכשיר';
  return /^[A-Za-z0-9]/.test(name) ? `הגדרות ל-${name}` : `הגדרות ל${name}`;
}

export function SettingsSheet({ settings: s, session, onChange, onClose, onLogout }: Props) {
  const { sheetRef, handleProps } = useSheetDrag(onClose);
  const [spend, setSpend] = useState<Spend | null>(null);
  const diag = useMemo(collectDiagnostics, []);
  const sample = useMemo(bookSample, []);
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  useEffect(() => {
    getSpend().then(setSpend).catch(() => {});
  }, []);
  const set = (patch: Partial<DeviceSettings>) => onChange({ ...s, ...patch });
  const round = (n: number) => Math.round(n * 10) / 10;

  return (
    <div class="overlay" onClick={onClose}>
      <div ref={sheetRef} class="sheet settings" role="dialog" aria-label="הגדרות" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grabber" aria-hidden="true" {...handleProps} />
        <div class="sheet-head" {...handleProps}>
          <h2>{settingsTitle(session.device)}</h2>
          <span class="spacer" />
          <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <p class="settings-preview en" lang="en" dir="ltr" style={{ fontSize: `${s.fontSize}px`, lineHeight: String(s.lineHeight) }} data-font={s.fontFamily}>
          {sample}
        </p>

        <div class="segmented themes" role="group" aria-label="ערכת צבע">
          {THEMES.map((t) => (
            <button key={t.id} aria-pressed={s.theme === t.id} onClick={() => set({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>

        {s.theme === 'auto' && (
          <p class="muted small theme-note">
            כרגע: {systemDark ? 'כהה' : 'בהיר'} · עוקב אחרי המכשיר ומתחלף כשהוא עובר בין יום ללילה
          </p>
        )}

        <div class="segmented fonts" role="group" aria-label="גופן">
          {FONTS.map((f) => (
            <button key={f.id} class={`font-${f.id}`} aria-pressed={s.fontFamily === f.id} onClick={() => set({ fontFamily: f.id })}>
              {f.label}
            </button>
          ))}
        </div>

        <Stepper
          label="גודל"
          value={`${s.fontSize}`}
          decLabel="הקטנת גופן"
          incLabel="הגדלת גופן"
          onDec={() => set({ fontSize: Math.max(12, s.fontSize - 1) })}
          onInc={() => set({ fontSize: Math.min(40, s.fontSize + 1) })}
        />
        <Stepper
          label="מרווח שורות"
          value={s.lineHeight.toFixed(1)}
          decLabel="הקטנת מרווח שורות"
          incLabel="הגדלת מרווח שורות"
          onDec={() => set({ lineHeight: round(Math.max(1.2, s.lineHeight - 0.1)) })}
          onInc={() => set({ lineHeight: round(Math.min(2.2, s.lineHeight + 0.1)) })}
        />
        <Stepper
          label="שוליים"
          value={`${s.margin}`}
          decLabel="הקטנת שוליים"
          incLabel="הגדלת שוליים"
          onDec={() => set({ margin: Math.max(4, s.margin - 4) })}
          onInc={() => set({ margin: Math.min(64, s.margin + 4) })}
        />

        <Stepper
          label="מילים חדשות לתרגול ביום"
          value={`${s.newPerDay}`}
          decLabel="פחות מילים חדשות ביום"
          incLabel="יותר מילים חדשות ביום"
          onDec={() => set({ newPerDay: Math.max(0, s.newPerDay - 5) })}
          onInc={() => set({ newPerDay: Math.min(50, s.newPerDay + 5) })}
        />

        <label class="field">
          <span>מנוע תרגום</span>
          <select value={s.engine} onChange={(e) => set({ engine: e.currentTarget.value })}>
            <option value="">ברירת המחדל של השרת</option>
            {ENGINES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <label class="toggle">
          <input type="checkbox" checked={s.autoTranslate} onChange={(e) => set({ autoTranslate: e.currentTarget.checked })} />
          <span>
            תרגום אוטומטי בלחיצה על מילה
            <span class="muted small block">כשכבוי: הלחיצה מסמנת ומאפשרת השמעה, ומתרגמים רק בכפתור "תרגם".</span>
          </span>
        </label>

        <VoicePicker voice={s.ttsVoice} onChange={(ttsVoice) => set({ ttsVoice })} />

        {spend && (
          <p class="muted small">
            הוצאה החודש: {spend.total.toFixed(3)}$ מתוך {spend.cap}$ ·{' '}
            {Object.values(spend.byEngine).reduce((n, e) => n + e.calls, 0)} תרגומים
            {spend.byEngine['google-nmt'] && (
              <>
                <br />
                Google Translate: {(spend.byEngine['google-nmt'].chars ?? 0).toLocaleString('he-IL')} מתוך 500,000 תווים חינם
                החודש
              </>
            )}
          </p>
        )}

        <details class="diag-details">
          <summary>בדיקת מכשיר</summary>
          <table class="diag">
            <tbody>
              {diag.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td class={r.label === 'User-Agent' ? 'ua' : undefined}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <button class="secondary logout" onClick={onLogout}>
          התנתקות מהמכשיר
        </button>
      </div>
    </div>
  );
}
