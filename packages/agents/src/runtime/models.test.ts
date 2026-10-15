import { describe, expect, it } from 'vitest';
import { AgentModelsError, resolveAgentModel, resolveAgentModels } from './models';
import { AGENT_NAMES } from './types';

describe('resolveAgentModels : le modèle de chaque agent est un réglage', () => {
  it('donne un modèle, un secours et une température à chacun des 6 agents', () => {
    const settings = resolveAgentModels();
    for (const name of AGENT_NAMES) {
      expect(settings[name].model).toMatch(/^[\w.-]+\/[\w.:-]+$/);
      expect(settings[name].temperature).toBeGreaterThanOrEqual(0);
    }
    expect(settings.designer.temperature).toBeGreaterThan(settings.analyste.temperature);
  });

  it('une valeur vide ou absente garde la configuration', () => {
    expect(resolveAgentModels('')).toEqual(resolveAgentModels());
    expect(resolveAgentModels('  ')).toEqual(resolveAgentModels());
  });

  it("accepte n'importe quel identifiant OpenRouter, y compris une variante gratuite", () => {
    const model = resolveAgentModel(
      'analyste',
      JSON.stringify({ analyste: 'google/gemma-4-31b-it:free' }),
    );
    expect(model.model).toBe('google/gemma-4-31b-it:free');
    expect(model).not.toHaveProperty('fallbackModel');
  });

  it('une surcharge en objet fixe aussi le modèle de secours ; les autres agents ne changent pas', () => {
    const settings = resolveAgentModels(
      JSON.stringify({
        stratege: {
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          fallback: 'google/gemma-4-26b-a4b-it:free',
        },
      }),
    );
    expect(settings.stratege.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(settings.stratege.fallbackModel).toBe('google/gemma-4-26b-a4b-it:free');
    expect(settings.analyste).toEqual(resolveAgentModels().analyste);
  });

  it('la température reste celle de la configuration (docs/agents R10), jamais celle de la variable', () => {
    const before = resolveAgentModels().designer.temperature;
    const settings = resolveAgentModels(JSON.stringify({ designer: 'google/gemma-4-31b-it:free' }));
    expect(settings.designer.temperature).toBe(before);
  });

  it.each([
    ['pas du json', 'JSON invalide'],
    ['["a/b"]', 'réglage invalide'],
    [JSON.stringify({ inconnu: 'a/b' }), 'réglage invalide'],
    [JSON.stringify({ analyste: 'sans-auteur' }), 'analyste'],
    [JSON.stringify({ analyste: { model: 'a/b', temperature: 2 } }), 'analyste'],
    [JSON.stringify({ aide: '' }), 'aide'],
  ])('refuse « %s » avec un message clair', (value, expected) => {
    expect(() => resolveAgentModels(value)).toThrow(AgentModelsError);
    expect(() => resolveAgentModels(value)).toThrow(expected);
  });
});
