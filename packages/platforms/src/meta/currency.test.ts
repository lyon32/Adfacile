import { describe, expect, it } from 'vitest';
import { FB_MIN_DAILY_BUDGET_CENTS } from './currency';

describe('budget minimum de Pubeka', () => {
  it('vaut 1 $ par jour, soit 100 centimes (TR-PLA-10)', () => {
    expect(FB_MIN_DAILY_BUDGET_CENTS).toBe(100);
  });
});
