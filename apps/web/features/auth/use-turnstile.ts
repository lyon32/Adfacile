'use client';
// CAPTCHA invisible Cloudflare Turnstile (D-1, SECURITE-BACKEND §3). Le jeton est vérifié par
// Supabase Auth. Documentation : developers.cloudflare.com/turnstile/get-started/client-side-rendering
// useEffect : synchronisation avec un système extérieur (script et widget de Cloudflare).
import { useCallback, useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      size: 'invisible' | 'flexible';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile indisponible'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface Captcha {
  /** À poser sur l'élément qui reçoit le widget (`ref={mountCaptcha}`). */
  mountCaptcha: (element: HTMLDivElement | null) => void;
  captchaToken: string | null;
  /** Un jeton ne sert qu'une fois : à appeler après chaque envoi. */
  resetCaptcha: () => void;
}

export function useTurnstile(siteKey: string | undefined): Captcha {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (siteKey === undefined || container === null) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container, {
          sitekey: siteKey,
          size: 'invisible',
          callback: setToken,
          'expired-callback': () => {
            setToken(null);
          },
          'error-callback': () => {
            setToken(null);
          },
        });
      })
      .catch(() => {
        setToken(null);
      });
    return () => {
      cancelled = true;
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, container]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, []);

  return { mountCaptcha: setContainer, captchaToken: token, resetCaptcha: reset };
}
