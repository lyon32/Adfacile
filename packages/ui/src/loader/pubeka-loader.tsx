'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import {
  claimFullLoader,
  fullLoaderDuration,
  SHORT_LOADER_DELAY_MS,
  type SessionFlagStore,
} from './loader-policy';

// Tracés repris de docs/design/logo/pubeka-logo-sombre.svg (logo v3) : le tracé « ubeka » de
// loader/react/PubekaLoader.jsx a perdu ses espaces et ne s'affiche pas.
const MARK = 'M5 119C12 116 15 110 15 100V66A28 28 0 1 1 33.4 92.3Q20 95 15 102';
const LINE = 'M30 118H384.4';
const TEXT =
  'M109.9 101.8L109.1 101.8Q99.7 101.8 94.5 95.7Q89.4 89.5 89.4 76.8L89.4 76.8L89.4 44.8L107.6 44.8L107.6 77.3Q107.6 81 109.8 83.3Q112 85.6 115.7 85.6Q119.4 85.6 121.7 83.3Q124 81 124 77.1L124 77.1L124 44.8L142.2 44.8L142.2 100L127.8 100L127.8 87Q127.3 89.1 126.7 90.8L126.7 90.8Q124.5 96.4 120.3 99.1Q116.1 101.8 109.9 101.8L109.9 101.8ZM188.2 101.8L188.2 101.8Q181.4 101.8 176.3 99Q171.3 96.2 168.5 90.8L168.5 90.8Q167.6 89.2 167 87.4L167 87.4L167 100L152.6 100L152.6 27L170.8 27L170.8 53.1Q173.5 48.7 177.7 46.1L177.7 46.1Q182.6 43.2 189.1 43.2L189.1 43.2Q194.7 43.2 199.2 45.3Q203.7 47.3 206.8 51.0Q210 54.8 211.7 59.9Q213.4 65 213.4 71.1L213.4 71.1L213.4 73.5Q213.4 79.6 211.7 84.8Q210 89.9 206.7 93.8Q203.4 97.6 198.8 99.7Q194.1 101.8 188.2 101.8ZM183 86.8L183 86.8Q186.6 86.8 189.3 85.0Q192.1 83.1 193.7 79.8Q195.2 76.5 195.2 72.3L195.2 72.3Q195.2 68 193.7 64.8Q192.1 61.7 189.4 59.9Q186.7 58.2 183 58.2L183 58.2Q179.7 58.2 176.8 59.7Q174 61.2 172.2 64.1Q170.4 67 170.4 71.1L170.4 71.1L170.4 74.5Q170.4 78.4 172.3 81.2Q174.2 83.9 177.1 85.3Q180 86.8 183 86.8ZM246.3 102L246.3 102Q239.3 102 233.9 99.6Q228.5 97.2 224.8 93.1Q221.1 89 219.2 83.9Q217.2 78.8 217.2 73.4L217.2 73.4L217.2 71.4Q217.2 65.8 219.2 60.6Q221.1 55.5 224.8 51.5Q228.4 47.5 233.7 45.1Q239 42.8 245.7 42.8L245.7 42.8Q254.6 42.8 260.8 46.8Q267 50.8 270.3 57.3Q273.6 63.9 273.6 71.6L273.6 71.6L273.6 77.4L234.4 77.4Q234.8 79 235.3 80.4L235.3 80.4Q236.6 83.8 239.3 85.6Q242 87.4 246.3 87.4L246.3 87.4Q250.1 87.4 252.6 86.1Q255 84.8 256 82.6L256 82.6L272.6 82.6Q271.4 88.2 267.9 92.6Q264.3 97 258.9 99.5Q253.4 102 246.3 102ZM234.4 67.6L234.4 67.6L256.5 67.6Q256.2 65.6 255.6 64L255.6 64Q254.3 60.8 251.9 59.1Q249.4 57.4 245.7 57.4L245.7 57.4Q242.1 57.4 239.5 59.0Q236.8 60.7 235.4 64L235.4 64Q234.7 65.6 234.4 67.6ZM339.7 100L319.4 100L303.1 74.2L298.4 74.2L298.4 100L280.2 100L280.2 27L298.4 27L298.4 70.5L317.3 44.8L336.3 44.8L318.9 68.4L339.7 100ZM389.9 100L375.5 100L375.5 89.7Q374.9 91.6 374.0 93.2L374.0 93.2Q371.7 97.2 367.8 99.3Q363.8 101.4 358.0 101.4Q352.2 101.4 347.7 99.3Q343.2 97.2 340.7 93.3Q338.1 89.3 338.1 83.8L338.1 83.8Q338.1 77.6 341.4 73.8Q344.7 69.9 350.5 68.1Q356.3 66.3 363.8 66.3L363.8 66.3L372.5 66.3Q372.5 62.7 370.8 60.8L370.8 60.8Q369.0 59 365.0 59L365.0 59Q363.1 59 359.4 59.1Q355.7 59.2 351.6 59.4Q347.5 59.6 344.1 59.8L344.1 59.8L344.1 44.6Q346.5 44.4 349.8 44.2Q353.1 44 356.7 43.9Q360.2 43.8 363.2 43.8L363.2 43.8Q371.7 43.8 377.7 46.3Q383.6 48.8 386.8 53.8Q389.9 58.8 389.9 66.5L389.9 66.5L389.9 100ZM372.5 79.6L372.5 75.7L363.8 75.7Q360.1 75.7 358.1 77.5Q356.1 79.4 356.1 82.5L356.1 82.5Q356.1 85.5 358.1 87.3Q360.1 89.2 363.8 89.2L363.8 89.2Q366.2 89.2 368.1 88.3Q369.9 87.5 371.1 85.4Q372.3 83.3 372.5 79.6L372.5 79.6Z';

export interface FullLoaderProps {
  /** Nom accessible, traduit par l'appelant (« Chargement de Pubeka »). */
  label: string;
  done?: boolean;
  className?: string;
}

/** Loader « Saisie » complet (3 s) : le « p » se dessine, puis le soulignement file sous le nom. */
export function FullLoader({ label, done = false, className }: FullLoaderProps) {
  return (
    <div
      className={cn('pubeka-loader', done ? 'done' : null, className)}
      role="status"
      aria-label={label}
    >
      <svg className="lg" viewBox="0 24 394 104" aria-hidden="true">
        <path className="mk" d={MARK} pathLength={1} />
        <path className="ln" d={LINE} pathLength={1} />
        <path className="tx" d={TEXT} />
      </svg>
    </div>
  );
}

/** Version courte : le « p » seul, pour un chargement entre deux pages. */
export function ShortLoader({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('pubeka-loader-short', className)} role="status" aria-label={label}>
      <svg viewBox="0 30 70 96" className="size-8" aria-hidden="true">
        <path className="mk" d={MARK} pathLength={1} />
      </svg>
    </span>
  );
}

export interface OpeningLoaderProps {
  label: string;
  onDone?: () => void;
  /** Stockage de la session ; `window.sessionStorage` par défaut. */
  store?: SessionFlagStore | null;
}

function defaultStore(): SessionFlagStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Loader d'ouverture : complet une seule fois par session (TR-PRF-04), sinon rien. */
export function OpeningLoader({ label, onDone, store }: OpeningLoaderProps) {
  const [playing, setPlaying] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Synchronisation avec un système extérieur (sessionStorage, minuterie) : CONVENTIONS §6.7.
  // La décision est prise une seule fois, au montage.
  useEffect(() => {
    if (!claimFullLoader(store === undefined ? defaultStore() : store)) {
      onDoneRef.current?.();
      return;
    }
    setPlaying(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      setPlaying(false);
      onDoneRef.current?.();
    }, fullLoaderDuration(reduced));
    return () => {
      window.clearTimeout(timer);
    };
  }, [store]);

  return playing ? <FullLoader label={label} /> : null;
}

export interface PendingLoaderProps {
  pending: boolean;
  label: string;
  delayMs?: number;
  className?: string;
}

/** Affiche la version courte seulement si `pending` dure plus de 300 ms (TR-PRF-04). */
export function PendingLoader({
  pending,
  label,
  delayMs = SHORT_LOADER_DELAY_MS,
  className,
}: PendingLoaderProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pending, delayMs]);
  return pending && visible ? (
    <ShortLoader label={label} {...(className ? { className } : {})} />
  ) : null;
}
