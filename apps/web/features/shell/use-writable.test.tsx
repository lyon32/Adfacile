// @vitest-environment happy-dom
// APPFLOW §19.2 : les commandes d'écriture se désactivent selon l'état de l'espace lu dans la session.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionProvider, type SessionValue } from './session-context';
import { useWorkspaceWritable } from './use-writable';

function Probe() {
  return <p>{useWorkspaceWritable() ? 'oui' : 'non'}</p>;
}

function session(status: 'active' | 'grace' | 'locked' | 'read_only' | 'suspended'): SessionValue {
  return {
    userId: 'u',
    email: 'a@b.test',
    firstName: null,
    lastName: null,
    locale: 'fr',
    theme: 'light',
    workspace: { id: 'w', name: 'x', role: 'owner', plan: 'pro', status },
  };
}

afterEach(cleanup);

describe('useWorkspaceWritable (TR-PAY-07)', () => {
  it.each([
    ['active', 'oui'],
    ['grace', 'non'],
    ['locked', 'non'],
    ['read_only', 'non'],
    ['suspended', 'non'],
  ] as const)('espace %s : modifiable = %s', (status, expected) => {
    render(
      <SessionProvider value={session(status)}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('hors session (composant isolé) : rien n’est bloqué', () => {
    render(<Probe />);
    expect(screen.getByText('oui')).toBeTruthy();
  });

  it('session sans espace : rien n’est bloqué', () => {
    render(
      <SessionProvider value={{ ...session('active'), workspace: null }}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('oui')).toBeTruthy();
  });
});
