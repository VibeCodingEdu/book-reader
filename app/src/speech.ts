// השמעה בקול הדפדפן, עם ידיעה מה מושמע כרגע – כדי שהכפתור יתחלף ל-⏹ ויעצור.
// "מפתח" מזהה את מה שמושמע (למשל מזהה המשפט), כך שרק הכפתור הנכון מסומן.

import { useEffect, useState } from 'preact/hooks';

let current: string | null = null;
const listeners = new Set<(key: string | null) => void>();

function setCurrent(key: string | null) {
  current = key;
  for (const l of listeners) l(key);
}

export function speak(text: string, key: string = text, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  // סיום (או ביטול) – רק אם זה עדיין מה שמושמע; ביטול של קודם לא ימחק את החדש
  u.onend = u.onerror = () => {
    if (current === key) setCurrent(null);
  };
  setCurrent(key);
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setCurrent(null);
}

/** לחיצה על 🔊: משמיע; לחיצה נוספת (⏹) על אותו פריט – עוצרת */
export function toggleSpeak(text: string, key: string = text) {
  if (current === key) stopSpeaking();
  else speak(text, key);
}

/** המפתח של מה שמושמע כרגע (או null) – מתעדכן אוטומטית */
export function useSpeakingKey(): string | null {
  const [key, setKey] = useState(current);
  useEffect(() => {
    listeners.add(setKey);
    return () => {
      listeners.delete(setKey);
    };
  }, []);
  return key;
}
