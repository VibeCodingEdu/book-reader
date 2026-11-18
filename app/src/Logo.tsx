// הלוגו של LingoRead: האות A (אלפבית) שהקו האמצעי שלה הוא ספר פתוח, נבט של שלושה עלים
// בראשה (צמיחה), סימנייה דקה בתוך ה-A וסימנייה בצבע ההדגשה מתחת לספר.
// שורטט מחדש כ-SVG לפי התמונה המקורית (סימטרי, אותם יחסים). הצורות בצבע הטקסט (currentColor)
// והסימנייה ב-var(--hl), כך שהלוגו מתאים לכל ערכת צבע וב-E-ink הוא שחור לגמרי.
// אותן צורות נמצאות גם ב-public/icon.svg וב-index.html (מסך הפתיחה) – לעדכן ביחד.

import { useId } from 'preact/hooks';

/** תיבת התצוגה: הסימן עצמו, ריבועי, עם מרווח קטן מסביב */
export const MARK_VIEWBOX = '55 42 930 930';

export function LogoMark({ size = 40, title }: { size?: number; title?: string }) {
  // מזהה ייחודי למסכה: כמה לוגואים באותו דף לא יתנגשו
  const cut = `lr-cut-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      class="logo-mark"
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <defs>
        {/* הרגליים של ה-A עוברות מאחורי הספר, עם רווח קטן מעל הדף העליון */}
        <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="1040" height="1040">
          <rect width="1040" height="1040" fill="#fff" />
          <path d="M107 688L190 573C330 578 460 620 520 714C580 620 710 578 850 573L933 688C820 700 620 735 520 790C420 735 220 700 107 688Z" fill="#000" />
          <path d="M132 668L190 573C330 578 460 620 520 714C580 620 710 578 850 573L908 668" fill="none" stroke="#000" stroke-width="82" stroke-linejoin="round" />
        </mask>
      </defs>
      <g fill="currentColor">
        <path d="M520 52C546 76 552 126 520 156C488 126 494 76 520 52Z" />
        <path d="M511 196C468 196 436 166 434 127C480 125 509 152 511 196Z" />
        <path d="M529 196C572 196 604 166 606 127C560 125 531 152 529 196Z" />
        <path d="M505.5 352h29v194l-14.5-13-14.5 13zM504 353 520 322 536 353z" />
      </g>
      <path d="M151 925 520 254 889 925" fill="none" stroke="currentColor" stroke-width="78" stroke-linecap="round" stroke-linejoin="round" mask={`url(#${cut})`} />
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M107 688C250 700 420 735 520 788C620 735 790 700 933 688" stroke-width="42" />
        <path d="M132 668L190 573C330 578 460 620 520 714C580 620 710 578 850 573L908 668" stroke-width="29" />
        <path d="M178 639C320 645 450 676 506 746M862 639C720 645 590 676 534 746" stroke-width="30" />
      </g>
      <path class="logo-ribbon" d="M468 822Q520 842 572 822V962L520 925 468 962Z" />
    </svg>
  );
}

/** סימן + שם (השם הוא ה-h1 של המסך). lg = מסך ההתחברות, עם שורת התיאור */
export function Brand({ size = 'md', tagline = false }: { size?: 'md' | 'lg'; tagline?: boolean }) {
  return (
    <div class={`brand ${size}`} dir="ltr">
      <LogoMark size={size === 'lg' ? 104 : 40} />
      <div class="brand-text">
        <h1 class="brand-name">LingoRead</h1>
        {tagline && <p class="brand-tagline">Read &amp; Learn English</p>}
      </div>
    </div>
  );
}
