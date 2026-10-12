import type { ReactNode } from 'react';

// Page vide de l'application (S01) ; le tableau de bord arrive en S09 dans console/(shell).
export default function ConsolePage(): ReactNode {
  return (
    <main data-zone="console">
      <h1>app.pubeka.com</h1>
    </main>
  );
}
