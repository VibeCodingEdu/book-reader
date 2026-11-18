import type { Annotation } from '../../shared/annotations';
import type { Review } from '../../shared/review';
import type { SegmentMeta } from '../../shared/audioTimeline';
import type { SavedWord } from '../../shared/words';
import type { BookMeta, Chapter } from '../../shared/book';
import type {
  ChapterTranslateRequest,
  ChapterTranslateResponse,
  SentenceTranslateRequest,
  SentenceTranslateResponse,
  TextTranslateRequest,
  TextTranslateResponse,
  WordLookupRequest,
  WordLookupResponse,
} from '../../shared/translate';
import { WORKER_URL } from './config';
import { idbGet, idbSet } from './idb';

const TOKEN_KEY = 'reader.token.v1';

export interface Session {
  token: string;
  device: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** הודעה ידידותית למשתמש (בלי פרטים טכניים כמו "חסר מפתח Claude בשרת") */
export function friendlyError(e: unknown, fallback = 'משהו השתבש. נסו שוב.'): string {
  if (!(e instanceof ApiError)) return e instanceof Error && e.message ? e.message : fallback;
  if (e.status === 0) return 'אין חיבור לשרת. בדקו את הרשת ונסו שוב.';
  if (e.status === 402) return 'הגעתם לתקרת ההוצאה החודשית על תרגום.';
  if (e.status === 503) return 'התרגום לא זמין כרגע. נסו שוב בעוד רגע.';
  if (e.status === 502) return 'המנוע לא החזיר תרגום תקין. נסו שוב.';
  return e.message || fallback;
}

/** נקרא כשהשרת מחזיר 401 – האפליקציה חוזרת למסך ההתחברות */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}, token = loadSession()?.token): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (res.status === 401 && token && path !== '/auth/login') {
    saveSession(null);
    onUnauthorized();
  }
  if (!res.ok) throw new ApiError(res.status, body.error ?? `שגיאת שרת (${res.status})`);
  return body;
}

// ---------- התחברות ----------

export async function login(passphrase: string, device: string): Promise<Session> {
  const { token } = await request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ passphrase, device }),
  });
  const s = { token, device };
  saveSession(s);
  return s;
}

export async function checkSession(s: Session): Promise<boolean> {
  try {
    await request('/auth/me', {}, s.token);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      saveSession(null);
      return false;
    }
    throw e;
  }
}

export function logout(): void {
  saveSession(null);
}

// ---------- ספרייה ----------

export interface SearchResult {
  gutenbergId: number;
  title: string;
  author: string;
  downloads: number;
}

export const searchGutenberg = (q: string) =>
  request<{ results: SearchResult[] }>(`/api/gutenberg/search?q=${encodeURIComponent(q)}`).then((r) => r.results);

export const listBooks = () => request<{ books: BookMeta[] }>('/api/books').then((r) => r.books);

/** hint: שם ומחבר שהאפליקציה כבר יודעת (מהצעה או מחיפוש) – למקרה שהקטלוג לא זמין */
export const importBook = (gutenbergId: number, hint?: { title: string; author: string }) =>
  request<{ book: BookMeta }>('/api/books/import', {
    method: 'POST',
    body: JSON.stringify({ gutenbergId, ...hint }),
  }).then((r) => r.book);

/** cover: data URL של JPEG מוקטן (מתוך EPUB), אופציונלי */
export const uploadBook = (meta: BookMeta, chapters: Chapter[], cover?: string) =>
  request<{ book: BookMeta }>('/api/books/upload', { method: 'POST', body: JSON.stringify({ meta, chapters, cover }) }).then(
    (r) => r.book,
  );

/** כריכת ספר כתמונה. null = לספר אין כריכה (מציגים כריכה טיפוגרפית). שגיאת רשת – זורק. */
export async function getCover(bookId: string): Promise<Blob | null> {
  const token = loadSession()?.token;
  const res = await fetch(`${WORKER_URL}/api/books/${encodeURIComponent(bookId)}/cover`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `שגיאת שרת (${res.status})`);
  return res.blob();
}

/** קובץ ספר מאתר קטלוג, דרך השרת (בלחיצת המשתמש) */
export async function fetchExternal(url: string): Promise<ArrayBuffer> {
  const token = loadSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/external?url=${encodeURIComponent(url)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `ההורדה נכשלה (${res.status})`);
  }
  return res.arrayBuffer();
}

export const deleteBook = (id: string) => request(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** פרק – קודם מהמטמון המקומי (IndexedDB), אחר כך מהשרת */
export async function getChapter(bookId: string, idx: number): Promise<Chapter> {
  const key = `chapter:${bookId}:${idx}`;
  const cached = await idbGet<Chapter>(key);
  if (cached) return cached;
  const { chapter } = await request<{ chapter: Chapter }>(`/api/books/${encodeURIComponent(bookId)}/chapters/${idx}`);
  void idbSet(key, chapter);
  return chapter;
}

// ---------- מיקום והגדרות ----------

export interface ServerPosition {
  sentenceId: string;
  device: string;
  updatedAt: number;
}

export const getPosition = (bookId: string) =>
  request<{ position: ServerPosition | null }>(`/api/positions/${encodeURIComponent(bookId)}`).then((r) => r.position);

export function putPosition(bookId: string, sentenceId: string, updatedAt: number, keepalive = false) {
  return request<{ position: ServerPosition }>(`/api/positions/${encodeURIComponent(bookId)}`, {
    method: 'PUT',
    body: JSON.stringify({ sentenceId, updatedAt }),
    keepalive,
  });
}

export const getServerSettings = () =>
  request<{ settings: { data: unknown; updatedAt: number } | null }>('/api/settings').then((r) => r.settings);

export const putServerSettings = (data: unknown, updatedAt: number) =>
  request('/api/settings', { method: 'PUT', body: JSON.stringify({ data, updatedAt }) });

// ---------- תרגום ----------

export const lookupWord = (req: WordLookupRequest) =>
  request<WordLookupResponse>('/api/translate/word', { method: 'POST', body: JSON.stringify(req) });

export const translateText = (req: TextTranslateRequest) =>
  request<TextTranslateResponse>('/api/translate/text', { method: 'POST', body: JSON.stringify(req) });

/** תרגום מקביל של פרק שלם (מזהה משפט → תרגום) */
export const translateChapter = (req: ChapterTranslateRequest) =>
  request<ChapterTranslateResponse>('/api/translate/chapter', { method: 'POST', body: JSON.stringify(req) });

/** תרגום משפט בודד */
export const translateSentence = (req: SentenceTranslateRequest) =>
  request<SentenceTranslateResponse>('/api/translate/sentence', { method: 'POST', body: JSON.stringify(req) });

// ---------- סימניות והערות ----------

export const getAnnotations = (bookId: string) =>
  request<{ items: Annotation[] }>(`/api/annotations?bookId=${encodeURIComponent(bookId)}`).then((r) => r.items);

export const putAnnotations = (items: Annotation[], keepalive = false) =>
  request('/api/annotations', { method: 'PUT', body: JSON.stringify({ items }), keepalive });

// ---------- מילים שמורות ----------

export const getWords = () => request<{ items: SavedWord[] }>('/api/words').then((r) => r.items);

export const putWords = (items: SavedWord[], keepalive = false) =>
  request('/api/words', { method: 'PUT', body: JSON.stringify({ items }), keepalive });

// ---------- יומן חזרות ----------

export const getReviewsAfter = (after: number) =>
  request<{ items: Review[]; last: number; more: boolean }>(`/api/reviews?after=${after}`);

export const postReviews = (items: Review[], keepalive = false) =>
  request('/api/reviews', { method: 'POST', body: JSON.stringify({ items }), keepalive });

// ---------- הקראה ----------

export interface TtsVoice {
  name: string;
  gender: string;
  language: string;
  type: 'Wavenet' | 'Neural2';
}
export interface TtsSample {
  /** MP3 בבסיס 64 */
  audio: string;
  mime: string;
  check: { sent: number; returned: number; missing: string[] };
  chars: number;
}
export const getTtsVoices = () => request<{ voices: TtsVoice[] }>('/api/tts/voices').then((r) => r.voices);
export const getTtsSample = (voice: string, text: string) =>
  request<TtsSample>('/api/tts/sample', { method: 'POST', body: JSON.stringify({ voice, text }) });

// ---------- הקראת פרק ----------

export interface TtsPlanSegment {
  para: number;
  part: number;
  sids: string[];
  chars: number;
  cached: boolean;
}
export interface TtsPlan {
  segments: TtsPlanSegment[];
  totalChars: number;
  uncachedChars: number;
}
export interface TtsChapterRef {
  bookId: string;
  chapter: number;
  voice: string;
}
export const getTtsPlan = (r: TtsChapterRef) =>
  request<TtsPlan>(`/api/tts/plan?bookId=${encodeURIComponent(r.bookId)}&chapter=${r.chapter}&voice=${encodeURIComponent(r.voice)}`);

/** מוודא שהקטע מוכן (מסנתז אם צריך) ומחזיר את כרטיס הזמנים שלו */
export const postTtsSegment = (r: TtsChapterRef & { para: number; part: number }) =>
  request<{ meta: SegmentMeta; cached: boolean }>('/api/tts/segment', {
    method: 'POST',
    body: JSON.stringify({ bookId: r.bookId, chapter: r.chapter, para: r.para, part: r.part, voice: r.voice }),
  });

/** קובץ ה-MP3 של קטע (עם הרשאה בכותרת, ולכן לא דרך <audio src>) */
export async function fetchTtsAudio(r: TtsChapterRef & { para: number; part: number }): Promise<ArrayBuffer> {
  const token = loadSession()?.token;
  const q = `bookId=${encodeURIComponent(r.bookId)}&chapter=${r.chapter}&voice=${encodeURIComponent(r.voice)}&para=${r.para}&part=${r.part}`;
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/tts/audio?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת');
  }
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `שגיאת שרת (${res.status})`);
  return res.arrayBuffer();
}

export interface Spend {
  month: string;
  cap: number;
  total: number;
  byEngine: Record<string, { usd: number; calls: number; chars?: number }>;
}
export const getSpend = () => request<Spend>('/api/spend');
