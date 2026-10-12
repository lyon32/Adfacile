// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTurnstile } from './use-turnstile';

// Faux Turnstile (pas de réseau) : clé de site de test « passe toujours » et jeton factice
// documentés par Cloudflare (developers.cloudflare.com/turnstile/troubleshooting/testing).
const TEST_SITE_KEY = '1x00000000000000000000BB';
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

function Probe(): ReactNode {
  const { mountCaptcha, captchaToken, resetCaptcha } = useTurnstile(TEST_SITE_KEY);
  return (
    <div>
      <div ref={mountCaptcha} />
      <output>{captchaToken ?? 'aucun'}</output>
      <button type="button" onClick={resetCaptcha}>
        reset
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  delete window.turnstile;
});

describe('useTurnstile', () => {
  it('charge le script, rend le widget invisible et récupère le jeton ; reset l’efface', async () => {
    let onToken: ((t: string) => void) | undefined;
    const reset = vi.fn();
    const appended = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      window.turnstile = {
        render: (_el, opts) => {
          expect(opts).toMatchObject({ sitekey: TEST_SITE_KEY, size: 'invisible' });
          onToken = opts.callback;
          return 'w1';
        },
        reset,
        remove: vi.fn(),
      };
      queueMicrotask(() => {
        (node as HTMLScriptElement).onload?.(new Event('load'));
      });
      return node;
    });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(appended).toHaveBeenCalled();
    act(() => {
      onToken?.(DUMMY_TOKEN);
    });
    expect(screen.getByRole('status').textContent).toBe(DUMMY_TOKEN);
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByRole('status').textContent).toBe('aucun');
    expect(reset).toHaveBeenCalledWith('w1');
    appended.mockRestore();
  });
});
