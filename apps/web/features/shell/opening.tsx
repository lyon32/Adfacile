'use client';
// Animation d'ouverture : une seule fois par session (APPFLOW §2.3, TR-PRF-04), puis fondu.
// Le droit de la jouer est pris une seule fois (useRef) : en développement, React exécute chaque
// effet deux fois, et un second contrôle verrait « déjà vu » alors que la première exécution a
// déjà démarré l'animation (le voile resterait alors affiché pour toujours).
import { FullLoader, claimFullLoader, fullLoaderDuration } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function Opening(): ReactNode {
  const t = useTranslations('shell');
  const [playing, setPlaying] = useState(false);
  const claimed = useRef<boolean | null>(null);

  // Synchronisation avec un système extérieur (sessionStorage, minuterie) : CONVENTIONS §6.7.
  useEffect(() => {
    claimed.current ??= claimFullLoader(sessionStore());
    if (!claimed.current) return undefined;
    setPlaying(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      setPlaying(false);
    }, fullLoaderDuration(reduced));
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return playing ? <FullLoader label={t('opening')} /> : null;
}
