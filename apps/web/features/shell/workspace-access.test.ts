import { describe, expect, it } from 'vitest';
import { isWritableStatus } from './workspace-access';

describe('isWritableStatus (TR-PAY-07, décision du 26/10/2026)', () => {
  it('seul « active » est modifiable ; grâce, verrouillé, lecture seule, suspendu et inconnu : non', () => {
    expect(isWritableStatus('active')).toBe(true);
    expect(isWritableStatus('grace')).toBe(false);
    expect(isWritableStatus('locked')).toBe(false);
    expect(isWritableStatus('read_only')).toBe(false);
    expect(isWritableStatus('suspended')).toBe(false);
    expect(isWritableStatus('autre')).toBe(false);
  });
});
