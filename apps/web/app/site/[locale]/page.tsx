import type { ReactNode } from 'react';

// Page vide du site public (S01) ; le contenu arrive en S32.
export const dynamicParams = false;

export function generateStaticParams(): { locale: string }[] {
  return [{ locale: 'fr' }, { locale: 'en' }];
}

export default function SitePage(): ReactNode {
  return (
    <main data-zone="site">
      <h1>pubeka.com</h1>
    </main>
  );
}
