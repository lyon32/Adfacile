// Cadre commun des écrans d'accès (sans barre latérale, LLD §2.1 console/(auth)).
import type { ReactNode } from 'react';
import styles from './auth.module.css';

export function AuthShell({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
