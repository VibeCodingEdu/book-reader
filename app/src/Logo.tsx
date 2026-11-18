// הלוגו של "חדר קריאה": חלון מקושת; הקו שיורד מראש הקשת הופך לשדרה של ספר פתוח שמונח
// על אדן החלון, וסימנייה בצבע ההדגשה יורדת מהספר. הקווים בצבע הטקסט, הסימנייה ב-var(--accent),
// כך שהלוגו מתאים לכל ערכת צבע (וב-E-ink הוא שחור לגמרי).
// אותן צורות בדיוק נמצאות ב-public/icon.svg וב-index.html (מסך הפתיחה) – לעדכן ביחד.

export const MARK_PATHS = {
  arch: 'M11 54V33a21 21 0 0 1 42 0v21',
  sill: 'M6.5 54h51',
  mullion: 'M32 12v26.5',
  book: 'M32 38.5c-4.2-2.5-9.6-3.1-15-2.2v14.9c5.4-.9 10.8-.3 15 2.2M32 38.5c4.2-2.5 9.6-3.1 15-2.2v14.9c-5.4-.9-10.8-.3-15 2.2M32 38.5v14.9',
  ribbon: 'M36 50.6h4v10.2l-2-1.8-2 1.8z',
};

export function LogoMark({ size = 40, title }: { size?: number; title?: string }) {
  return (
    <svg
      class="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d={MARK_PATHS.arch} />
        <path d={MARK_PATHS.sill} />
        <path d={MARK_PATHS.mullion} />
        <path d={MARK_PATHS.book} />
      </g>
      <path class="logo-ribbon" d={MARK_PATHS.ribbon} />
    </svg>
  );
}

/** סימן + שם (השם הוא ה-h1 של המסך). lg = מסך ההתחברות, עם שורת תיאור */
export function Brand({ size = 'md', tagline = false }: { size?: 'md' | 'lg'; tagline?: boolean }) {
  return (
    <div class={`brand ${size}`}>
      <LogoMark size={size === 'lg' ? 88 : 42} />
      <div class="brand-text">
        <h1 class="brand-name">חדר קריאה</h1>
        {tagline && <p class="brand-tagline">ללמוד אנגלית דרך ספרים</p>}
      </div>
    </div>
  );
}
