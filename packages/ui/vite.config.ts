// Page de démonstration interne de @pubeka/ui (ROADMAP S08) : `pnpm --filter @pubeka/ui demo`.
// Port 5180 : 5173 reste réservé à l'application (CLAUDE.md §3).
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  plugins: [react(), tailwindcss()],
  server: { port: 5180, strictPort: true },
});
