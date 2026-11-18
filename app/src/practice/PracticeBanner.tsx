// כרטיס בספרייה: "X מילים לתרגול היום". מוצג רק כשיש מה לתרגל.

import { Icon } from '../Icon';
import { usePractice } from './usePractice';

export function PracticeBanner({ newPerDay, onPractice }: { newPerDay: number; onPractice: () => void }) {
  const p = usePractice(newPerDay);
  if (!p.ready) return null;
  const due = p.queue.due.length;
  const fresh = p.queue.fresh.length;
  if (!due && !fresh) return null;
  const parts = [due && `${due} לחזרה`, fresh && `${fresh} ${fresh === 1 ? 'חדשה' : 'חדשות'}`].filter(Boolean).join(' · ');
  return (
    <button class="practice-banner" onClick={onPractice}>
      <Icon name="star" size={22} />
      <span class="practice-banner-body">
        <span class="eyebrow">תרגול מילים</span>
        <span class="practice-banner-text">
          {due + fresh} {due + fresh === 1 ? 'מילה' : 'מילים'} להיום
        </span>
        <span class="muted small">{parts}</span>
      </span>
      <Icon name="chevronLeft" size={20} />
    </button>
  );
}
