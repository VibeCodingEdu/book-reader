// הגדרות המכשיר. חלוקה לאזורים ברורים: תצוגה, תרגום, הקראה, תרגול, שימוש החודש והמכשיר.
// כל אזור הוא כרטיס עם כותרת והסבר קצר; פריטים מתקפלים (פירוט, בדיקת מכשיר) מסומנים בחץ.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ENGINES } from '../../shared/translate';
import { getSpend, type Session, type Spend } from './api';
import { collectDiagnostics } from './diagnostics';
import type { DeviceSettings, FontFamily, Theme } from './deviceSettings';
import { Icon } from './Icon';
import { SpendDetails } from './SpendDetails';
import { useSheetDrag } from './useSheetDrag';
import { VoicePicker } from './VoicePicker';

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

/** "הגדרות לאייפון", ובשם לועזי (Boox) עם מקף: "הגדרות ל-Boox" */
export function settingsTitle(device: string): string {
  const name = device.trim() || 'מכשיר';
  return /^[A-Za-z0-9]/.test(name) ? `הגדרות ל-${name}` : `הגדרות ל${name}`;
}

// ---------- רכיבים קטנים ----------

/** אזור בהגדרות: כותרת, הסבר אופציונלי וכרטיס עם התוכן */
function Section({ title, hint, children }: { title: string; hint?: string; children: ComponentChildren }) {
  return (
    <section class="set-section">
      <h3>{title}</h3>
      {hint && <p class="set-hint">{hint}</p>}
      <div class="set-card">{children}</div>
    </section>
  );
}

/** שורה בכרטיס: תווית (והסבר) מצד אחד, פקד מהצד השני */
function Row({ label, hint, children, stack }: { label: string; hint?: string; children: ComponentChildren; stack?: boolean }) {
  return (
    <div class={`set-row ${stack ? 'stack' : ''}`}>
      <div class="set-row-text">
        <span class="set-row-label">{label}</span>
        {hint && <span class="set-row-hint">{hint}</span>}
      </div>
      <div class="set-row-control">{children}</div>
    </div>
  );
}

/** מתג הפעלה / כיבוי */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" class="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span class="switch-knob">{checked && <Icon name="check" size={14} />}</span>
    </button>
  );
}

/** מספר עם כפתורי פחות / יותר (תמיד בסדר − ערך +, גם בממשק מימין לשמאל) */
function Stepper(props: { value: string; onDec: () => void; onInc: () => void; decLabel: string; incLabel: string }) {
  return (
    <div class="stepper2" dir="ltr">
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

/** פריט מתקפל עם חץ (במקום <details>, שלא ברור שאפשר ללחוץ עליו) */
export function Disclosure({ title, children, onOpen }: { title: string; children: ComponentChildren; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="disclosure">
      <button
        type="button"
        class="disclosure-head"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        <span>{title}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      <div class={`collapse ${open ? 'open' : ''}`}>
        <div>
          <div class="disclosure-body">{open && children}</div>
        </div>
      </div>
    </div>
  );
}

/** מדד שימוש: פס התקדמות עם מספרים. מעל 80% – מודגש */
function Meter({ label, text, value, max }: { label: string; text: string; value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div class="meter">
      <div class="meter-head">
        <span>{label}</span>
        <span class="meter-text" dir="ltr">
          {text}
        </span>
      </div>
      <div class={`meter-track ${pct >= 80 ? 'high' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        <span style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : 0 }} />
      </div>
    </div>
  );
}

/** ריבוע ערכת צבע: "Aa" בצבעי הערכה עצמה */
function ThemeTile({ id, label, selected, onClick }: { id: Theme; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button class={`theme-tile t-${id}`} aria-pressed={selected} aria-label={`ערכת צבע: ${label}`} onClick={onClick}>
      <span class="theme-swatch" aria-hidden="true">
        Aa
      </span>
      <span class="theme-name">{label}</span>
    </button>
  );
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

  const google = spend?.byEngine['google-nmt'];
  const tts = spend?.byEngine['google-tts'];
  const n = (x: number) => x.toLocaleString('he-IL');

  return (
    <div class="overlay" onClick={onClose}>
      <div ref={sheetRef} class="sheet settings" role="dialog" aria-label="הגדרות" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grabber" aria-hidden="true" {...handleProps} />
        <div class="sheet-head set-head" {...handleProps}>
          <h2>{settingsTitle(session.device)}</h2>
          <span class="spacer" />
          <button class="icon-btn" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {/* ---------- תצוגה ---------- */}
        <Section title="תצוגת הקריאה" hint="ההגדרות האלה נשמרות לכל מכשיר בנפרד.">
          <p class="settings-preview en" lang="en" dir="ltr" style={{ fontSize: `${s.fontSize}px`, lineHeight: String(s.lineHeight) }} data-font={s.fontFamily}>
            {sample}
          </p>

          <div class="theme-grid" role="group" aria-label="ערכת צבע">
            {THEMES.map((t) => (
              <ThemeTile key={t.id} id={t.id} label={t.label} selected={s.theme === t.id} onClick={() => set({ theme: t.id })} />
            ))}
          </div>
          {s.theme === 'auto' && (
            <p class="set-note">כרגע {systemDark ? 'כהה' : 'בהיר'}. עוקב אחרי המכשיר ומתחלף כשהוא עובר בין יום ללילה.</p>
          )}

          <div class="font-grid" role="group" aria-label="גופן">
            {FONTS.map((f) => (
              <button key={f.id} class={`font-chip font-${f.id}`} aria-pressed={s.fontFamily === f.id} onClick={() => set({ fontFamily: f.id })}>
                {f.label}
              </button>
            ))}
          </div>

          <Row label="גודל הגופן">
            <Stepper
              value={`${s.fontSize}`}
              decLabel="הקטנת גופן"
              incLabel="הגדלת גופן"
              onDec={() => set({ fontSize: Math.max(12, s.fontSize - 1) })}
              onInc={() => set({ fontSize: Math.min(40, s.fontSize + 1) })}
            />
          </Row>
          <Row label="מרווח שורות">
            <Stepper
              value={s.lineHeight.toFixed(1)}
              decLabel="הקטנת מרווח שורות"
              incLabel="הגדלת מרווח שורות"
              onDec={() => set({ lineHeight: round(Math.max(1.2, s.lineHeight - 0.1)) })}
              onInc={() => set({ lineHeight: round(Math.min(2.2, s.lineHeight + 0.1)) })}
            />
          </Row>
          <Row label="שוליים">
            <Stepper
              value={`${s.margin}`}
              decLabel="הקטנת שוליים"
              incLabel="הגדלת שוליים"
              onDec={() => set({ margin: Math.max(4, s.margin - 4) })}
              onInc={() => set({ margin: Math.min(64, s.margin + 4) })}
            />
          </Row>
        </Section>

        {/* ---------- תרגום ---------- */}
        <Section title="תרגום" hint="תרגום מילה בלחיצה. משפטים, קטעים ותרגום מקביל מתורגמים תמיד בגוגל תרגום.">
          <Row stack label="מנוע לתרגום מילים" hint="ברירת המחדל מתאימה ברוב המקרים.">
            <select value={s.engine} onChange={(e) => set({ engine: e.currentTarget.value })} aria-label="מנוע לתרגום מילים">
              <option value="">ברירת המחדל של השרת</option>
              {ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="תרגום אוטומטי בלחיצה" hint="כשכבוי: לחיצה על מילה רק מסמנת אותה, ומתרגמים בכפתור ״תרגם״.">
            <Switch checked={s.autoTranslate} onChange={(v) => set({ autoTranslate: v })} label="תרגום אוטומטי בלחיצה על מילה" />
          </Row>
        </Section>

        {/* ---------- הקראה ---------- */}
        <Section title="הקראה" hint="הקול שבו הספר מוקרא (כפתור האוזניות בספר). החלפת קול מכינה את הפרק מחדש, פעם אחת לכל פרק.">
          <VoicePicker voice={s.ttsVoice} onChange={(ttsVoice) => set({ ttsVoice })} />
        </Section>

        {/* ---------- תרגול ---------- */}
        <Section title="תרגול מילים">
          <Row label="מילים חדשות ביום" hint="כמה מילים שמורות חדשות מתחילים לתרגל בכל יום.">
            <Stepper
              value={`${s.newPerDay}`}
              decLabel="פחות מילים חדשות ביום"
              incLabel="יותר מילים חדשות ביום"
              onDec={() => set({ newPerDay: Math.max(0, s.newPerDay - 5) })}
              onInc={() => set({ newPerDay: Math.min(50, s.newPerDay + 5) })}
            />
          </Row>
        </Section>

        {/* ---------- שימוש ---------- */}
        <Section title="שימוש החודש" hint="המכסות מתאפסות בתחילת כל חודש.">
          {!spend && <p class="set-note">טוען…</p>}
          {spend && (
            <>
              <Meter
                label="תרגום בגוגל (חינם)"
                text={`${n(google?.chars ?? 0)} / ${n(500_000)} תווים`}
                value={google?.chars ?? 0}
                max={500_000}
              />
              <Meter
                label="הקראה"
                text={`${n(tts?.chars ?? 0)} / ${n(spend.ttsLimit ?? 900_000)} תווים`}
                value={tts?.chars ?? 0}
                max={spend.ttsLimit ?? 900_000}
              />
              <Meter label="הוצאה בדולרים" text={`$${spend.total.toFixed(3)} / $${spend.cap}`} value={spend.total} max={spend.cap} />
              <Disclosure title="פירוט: מה נצרך החודש">
                <SpendDetails spend={spend} />
              </Disclosure>
            </>
          )}
        </Section>

        {/* ---------- מכשיר ---------- */}
        <Section title="המכשיר">
          <Disclosure title="בדיקת מכשיר">
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
          </Disclosure>
          <button class="secondary logout" onClick={onLogout}>
            התנתקות מהמכשיר
          </button>
        </Section>
      </div>
    </div>
  );
}
