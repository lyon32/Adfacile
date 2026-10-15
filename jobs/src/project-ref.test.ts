import { describe, expect, it } from 'vitest';
import { resolveProjectRef, STAGING_PROJECT_REF } from './project-ref';

const PRODUCTION_PROJECT_REF = 'proj_wnjyspfoeknisnyzygkj';

describe('projet Trigger.dev de trigger.config.ts', () => {
  it('variable présente : elle est utilisée', () => {
    expect(resolveProjectRef('proj_autreprojet123456')).toBe('proj_autreprojet123456');
  });

  it('variable absente ou vide (indexation distante) : projet de préproduction, sans lever', () => {
    expect(resolveProjectRef(undefined)).toBe(STAGING_PROJECT_REF);
    expect(resolveProjectRef('')).toBe(STAGING_PROJECT_REF);
    expect(resolveProjectRef('  ')).toBe(STAGING_PROJECT_REF);
  });

  it('la production n est jamais la valeur par défaut', () => {
    expect(STAGING_PROJECT_REF).not.toBe(PRODUCTION_PROJECT_REF);
    expect(resolveProjectRef(undefined)).not.toBe(PRODUCTION_PROJECT_REF);
  });
});

describe('trigger.config.ts', () => {
  it('se charge sans TRIGGER_PROJECT_REF et ne lève pas', async () => {
    const saved = process.env.TRIGGER_PROJECT_REF;
    delete process.env.TRIGGER_PROJECT_REF;
    try {
      const config = (await import('../trigger.config')).default;
      expect(config.project).toBe(STAGING_PROJECT_REF);
    } finally {
      if (saved !== undefined) process.env.TRIGGER_PROJECT_REF = saved;
    }
  });
});
