// סמלי קו (SVG) במקום אימוג'י: נראים אותו דבר בכל מכשיר, מקבלים את צבע הטקסט,
// וב-E-ink הקו מתעבה (ראו .icon ב-styles.css). הצורות בסגנון Lucide (רישיון ISC).

const PATHS = {
  back: <path d="M5 12h14M13 6l6 6-6 6" />, // חזרה (בממשק מימין לשמאל החץ פונה ימינה)
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  type: <path d="M4 18 9 6l5 12M5.6 14h6.8M15 18l2.6-7 2.4 7M15.7 16h3.6" />,
  toc: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  speak: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  bookmark: <path d="M7 4h10v16l-5-3.5L7 20z" />,
  note: <path d="M15.5 4.5l4 4L9 19H5v-4zM13 7l4 4" />,
  translate: (
    <>
      <path d="M4 5h9M8.5 3v2M6 5c.6 3.4 3 6.2 6 7.5M11 5c-.8 3.6-3.4 6.6-7 8" />
      <path d="M13 21l4-9 4 9M14.4 18h5.2" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  chevronUp: <path d="m6 14 6-6 6 6" />,
  chevronDown: <path d="m6 10 6 6 6-6" />,
  headphones: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z" />,
  books: <path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5.2l3.8-1 3.7 15.5-3.8 1z" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  more: <path d="M12 6h.01M12 12h.01M12 18h.01" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
