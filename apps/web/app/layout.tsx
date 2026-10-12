import type { ReactNode } from 'react';

// Squelette (S01) : police, thème et fournisseurs globaux arrivent en S08-S09.
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
