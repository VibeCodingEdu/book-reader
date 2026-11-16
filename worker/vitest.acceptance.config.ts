import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['acceptance/**/*.acceptance.test.ts'],
    // כל המנועים ירוצו, גם אם אחד נכשל – כדי לראות את כל הטבלה
    bail: 0,
  },
});
