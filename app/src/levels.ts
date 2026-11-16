// סדר רמות CEFR, כולל רמות ביניים כמו "A2/B1" ו-"B1+"

const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** מספר למיון: A1=0, A1/A2=0.5, A2=1, B1+=2.3, ... ; רמה לא ידועה – בסוף */
export function levelRank(level: string | undefined): number {
  if (!level) return 99;
  const parts = level.toUpperCase().split(/[/–-]/).map((p) => p.trim());
  const ranks = parts.map((p) => {
    const i = ORDER.indexOf(p.replace('+', ''));
    return i < 0 ? NaN : i + (p.endsWith('+') ? 0.3 : 0);
  });
  const valid = ranks.filter((r) => !Number.isNaN(r));
  if (!valid.length) return 99;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** האם הרמה של ספר נוגעת באחת מהרמות שנבחרו לסינון ("A2/B1" נכלל גם ב-A2 וגם ב-B1) */
export function levelMatches(level: string | undefined, selected: Set<string>): boolean {
  if (!selected.size) return true;
  if (!level) return false;
  return level
    .toUpperCase()
    .split(/[/–-]/)
    .some((p) => selected.has(p.trim().replace('+', '')));
}

export const FILTER_LEVELS = ORDER;
