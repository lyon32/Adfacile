import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });

export const metadata: Metadata = { title: { default: 'Pubeka', template: '%s · Pubeka' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Racine commune au site, à l'application et à l'administration. La langue et le thème de
// l'application sont posés par console/layout.tsx (DocumentSync) : lire un cookie ici
// rendrait le site public dynamique.
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="fr" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
