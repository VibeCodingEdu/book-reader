// בדיקת יכולות המכשיר – עוזרת לסגור את השאלה הפתוחה לגבי ה-Boox.

export interface DiagRow {
  label: string;
  value: string;
  ok?: boolean;
}

export function collectDiagnostics(): DiagRow[] {
  const nav = navigator as Navigator & { standalone?: boolean };
  const mq = (q: string) => window.matchMedia(q).matches;
  const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1];
  const safari = /Version\/([\d.]+).*Safari/.exec(navigator.userAgent)?.[1];

  return [
    { label: 'דפדפן', value: chrome ? `Chrome ${chrome}` : safari ? `Safari ${safari}` : 'לא מזוהה' },
    { label: 'מסך (CSS px)', value: `${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio}` },
    { label: 'מסך מונוכרום', value: mq('(monochrome)') ? 'כן' : 'לא' },
    { label: 'מגע', value: `${navigator.maxTouchPoints} נקודות` },
    {
      label: 'מותקן כאפליקציה',
      value: mq('(display-mode: standalone)') || nav.standalone ? 'כן' : 'לא (דרך הדפדפן)',
    },
    { label: 'פיצול משפטים (Intl.Segmenter)', value: 'Segmenter' in Intl ? 'נתמך' : 'חסר', ok: 'Segmenter' in Intl },
    { label: 'אחסון מקומי (IndexedDB)', value: 'indexedDB' in window ? 'נתמך' : 'חסר', ok: 'indexedDB' in window },
    { label: 'נגן במסך נעילה (Media Session)', value: 'mediaSession' in navigator ? 'נתמך' : 'חסר', ok: 'mediaSession' in navigator },
    { label: 'User-Agent', value: navigator.userAgent },
  ];
}

/** מפצל טקסט אנגלי למשפטים בעזרת Intl.Segmenter – הדגמה לאבן דרך 1. */
export function splitSentences(text: string, lang = 'en'): string[] {
  if (!('Segmenter' in Intl)) return [text];
  const seg = new Intl.Segmenter(lang, { granularity: 'sentence' });
  return Array.from(seg.segment(text), (s) => s.segment.trim()).filter(Boolean);
}
