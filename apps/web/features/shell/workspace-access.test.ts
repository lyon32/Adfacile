import { describe, expect, it } from 'vitest';
import { isWritableStatus } from './workspace-access';

describe('isWritableStatus (TR-PAY-07)', () => {
  it('actif et grâce : modifiable ; lecture seule, suspendu et inconnu : non', () => {
    expect(isWritableStatus('active')).toBe(true);
    expect(isWritableStatus('grace')).toBe(true);
    expect(isWritableStatus('read_only')).toBe(false);
    expect(isWritableStatus('suspended')).toBe(false);
    expect(isWritableStatus('autre')).toBe(false);
  });
});
