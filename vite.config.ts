import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      usePolling: true,
    },
    // Le retour d'authentification Facebook doit arriver sur une URL publique
    // en HTTPS : l'application Meta est en mode Live, où localhost n'est pas
    // accepté. Un tunnel Cloudflare expose donc ce serveur, et Vite refuse par
    // défaut les hôtes qu'il ne connaît pas. Le suffixe couvre toutes les URL
    // éphémères, qui changent à chaque démarrage du tunnel.
    allowedHosts: ['.trycloudflare.com'],
    // En production, nginx proxifie /api/ vers le backend (voir nginx.conf), et
    // les composants appellent donc des chemins relatifs. Sans le même relais
    // ici, ces appels atteignent le serveur de dev, qui répond index.html : le
    // navigateur signale alors « Unexpected token '<' » au lieu du JSON attendu.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})

