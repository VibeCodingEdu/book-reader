import { useEffect, useRef, useState } from 'preact/hooks';
import type { BookMeta } from '../../shared/book';
import {
  ApiError,
  getServerSettings,
  loadSession,
  login,
  logout,
  putServerSettings,
  setUnauthorizedHandler,
  type Session,
} from './api';
import { loadSettings, normalizeSettings, saveSettings, type DeviceSettings } from './deviceSettings';
import { Catalog } from './Catalog';
import { Library } from './Library';
import { Reader } from './Reader';
import { Words } from './Words';
import { Practice } from './practice/Practice';
import { listBooks } from './api';
import { Brand } from './Logo';
import { SettingsSheet } from './SettingsSheet';

/** משך האנימציה של מסך הפתיחה (index.html), מתחילת טעינת הדף */
const SPLASH_MS = 1650;

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'אייפון';
  if (/Android/.test(ua) && navigator.maxTouchPoints > 0) return 'Boox';
  return 'מחשב';
}

export function App() {
  const [settings, setSettings] = useState<DeviceSettings>(loadSettings);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [book, setBook] = useState<BookMeta | null>(null);
  const [catalog, setCatalog] = useState<Set<string> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  /** פתיחת ספר במשפט מסוים (מרשימת המילים) */
  const [startSid, setStartSid] = useState<string | undefined>(undefined);
  const openBook = (b: BookMeta | null, sid?: string) => {
    setStartSid(sid);
    setBook(b);
  };
  const openSentence = async (bookId: string, sid: string) => {
    try {
      const b = (await listBooks()).find((x) => x.id === bookId);
      if (b) openBook(b, sid);
      else alert('הספר הזה כבר לא בספרייה');
    } catch {
      alert('אין חיבור לשרת');
    }
  };

  useEffect(() => setUnauthorizedHandler(() => setSession(null)), []);

  // מסך הפתיחה (ב-index.html): מחכים שהאנימציה של הלוגו תסתיים (כ-1.5 שניות מטעינת הדף),
  // ואז הוא נעלם. ב-E-ink ובהפחתת תנועה אין אנימציה – נעלם מיד.
  useEffect(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const still =
      document.documentElement.dataset.theme === 'eink' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const wait = still ? 0 : Math.max(0, SPLASH_MS - performance.now());
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t1 = setTimeout(() => {
      splash.classList.add('gone');
      t2 = setTimeout(() => splash.remove(), 350);
    }, wait);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // ערכת הצבע חלה על כל הדף. "אוטו" = יום/לילה לפי המכשיר, ומתעדכן כשהמכשיר מתחלף.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = settings.theme === 'auto' ? (mq?.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = t;
      // שורת המצב באייפון/אנדרואיד בצבע הרקע של הערכה
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#ffffff');
    };
    apply();
    if (settings.theme !== 'auto' || !mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // סנכרון הגדרות: בהתחברות – לוקחים מהשרת אם שם חדש יותר
  useEffect(() => {
    if (!session) return;
    getServerSettings()
      .then((srv) => {
        if (srv && srv.updatedAt > settings.updatedAt) {
          const s = normalizeSettings({ ...(srv.data as object), updatedAt: srv.updatedAt });
          setSettings(s);
          saveSettings(s);
        }
      })
      .catch(() => {});
  }, [session?.token]);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateSettings = (next: DeviceSettings) => {
    const s = { ...next, updatedAt: Date.now() };
    setSettings(s);
    saveSettings(s);
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const { updatedAt, ...data } = s;
      putServerSettings(data, updatedAt).catch(() => {});
    }, 1500);
  };

  if (!session) return <LoginScreen onDone={setSession} />;

  return (
    <>
      {book ? (
        <Reader
          key={`${book.id}:${startSid ?? ''}`}
          book={book}
          startSid={startSid}
          settings={settings}
          onBack={() => openBook(null)}
          onOpenSettings={() => setShowSettings(true)}
          onPatchSettings={(patch) => updateSettings({ ...settings, ...patch })}
        />
      ) : showPractice ? (
        <Practice newPerDay={settings.newPerDay} onBack={() => setShowPractice(false)} />
      ) : showWords ? (
        <Words onBack={() => setShowWords(false)} onPractice={() => setShowPractice(true)} onOpenSentence={openSentence} />
      ) : catalog ? (
        <Catalog
          have={catalog}
          onBack={() => setCatalog(null)}
          onUploaded={(b) => {
            setCatalog(null);
            openBook(b);
          }}
        />
      ) : (
        <Library
          onOpen={(b) => openBook(b)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCatalog={setCatalog}
          onOpenWords={() => setShowWords(true)}
          onPractice={() => setShowPractice(true)}
          newPerDay={settings.newPerDay}
        />
      )}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          session={session}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            logout();
            setShowSettings(false);
            setBook(null);
            setShowWords(false);
            setShowPractice(false);
            setSession(null);
          }}
        />
      )}
    </>
  );
}

function LoginScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [device, setDevice] = useState(guessDeviceName);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main class="page">
      <Brand size="lg" tagline />
      <section class="card login-card">
        <h2>התחברות</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              onDone(await login(pass, device.trim() || 'מכשיר'));
            } catch (err) {
              setError(
                err instanceof ApiError && err.status === 401 ? 'סיסמה שגויה' : err instanceof Error ? err.message : 'שגיאה',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            <span>שם המכשיר</span>
            <input type="text" value={device} onInput={(e) => setDevice(e.currentTarget.value)} />
          </label>
          <label>
            <span>סיסמה אישית</span>
            <input
              type="password"
              autoComplete="current-password"
              value={pass}
              onInput={(e) => setPass(e.currentTarget.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy || !pass}>
            {busy ? 'מתחבר…' : 'התחברות'}
          </button>
          {error && (
            <p class="msg bad" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
