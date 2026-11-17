// Google Translate (Cloud Translation – Basic, v2, מודל NMT) לתרגום משפטים וקטעים.
// v2 עובד עם מפתח API רגיל; המפתח נשלח בכותרת x-goog-api-key ולא בכתובת (לפי ההמלצה של גוגל).

export const GOOGLE_NMT = 'google-nmt';
/** המכסה החינמית היא 500 אלף תווים בחודש; עוצרים קצת לפני, למקרה של ספירה לא מדויקת */
export const GOOGLE_FREE_CHARS = 480_000;
/** גוגל מקבלת עד 128 קטעים בבקשה */
const MAX_SEGMENTS = 128;

export async function googleTranslate(apiKey: string, texts: string[], target = 'he', source = 'en'): Promise<string[]> {
  if (texts.length > MAX_SEGMENTS) throw new Error('יותר מדי קטעים לבקשה אחת');
  const res = await fetch('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ q: texts, source, target, format: 'text', model: 'nmt' }),
  });
  if (!res.ok) throw new Error(`Google Translate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: { translations?: { translatedText?: string }[] } };
  const out = data.data?.translations ?? [];
  if (out.length !== texts.length) throw new Error('Google Translate החזיר מספר תרגומים שגוי');
  return out.map((t) => t.translatedText ?? '');
}

export const countChars = (texts: string[]) => texts.reduce((n, t) => n + t.length, 0);
