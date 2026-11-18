// גיליון תחתון שנסגר בהחלקה למטה, כמו באייפון: גוררים מהראש של הגיליון (הידית והכותרת),
// הגיליון זז עם האצבע, ובשחרור – נסגר אם עבר את הסף או הוחלק מהר, אחרת חוזר למקומו בקפיץ.
// בלי אנימציה ב-E-ink ובהפחתת תנועה (אז פשוט נסגר או נשאר). כפתורים בכותרת ממשיכים לעבוד רגיל.

import { useRef } from 'preact/hooks';

const CLOSE_DISTANCE = 90; // px
const CLOSE_VELOCITY = 0.55; // px/ms

function stillMotion(): boolean {
  return (
    document.documentElement.dataset.theme === 'eink' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; t0: number; y: number; t: number; moved: boolean } | null>(null);

  const setY = (y: number, animate: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate && !stillMotion() ? 'transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';
    el.style.transform = y ? `translateY(${y}px)` : '';
  };

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp, y: e.clientY, t: e.timeStamp, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    d.y = e.clientY;
    d.t = e.timeStamp;
    // למעלה – מתנגד (גומי), למטה – עוקב אחרי האצבע
    setY(dy > 0 ? dy : dy * 0.2, false);
  };

  const end = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const dy = e.clientY - d.y0;
    const v = (e.clientY - d.y) / Math.max(1, e.timeStamp - d.t) || dy / Math.max(1, e.timeStamp - d.t0);
    if (dy > CLOSE_DISTANCE || (dy > 20 && v > CLOSE_VELOCITY)) {
      const el = sheetRef.current;
      if (el && !stillMotion()) {
        el.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 1, 1)';
        el.style.transform = 'translateY(110%)';
        setTimeout(onClose, 190);
      } else onClose();
    } else setY(0, true);
  };

  return {
    sheetRef,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
  };
}
