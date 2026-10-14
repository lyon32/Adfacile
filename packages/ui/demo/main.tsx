/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './demo';
import './demo.css';

// Paramètres d'adresse pour les captures : ?theme=dark&lang=en
const params = new URLSearchParams(window.location.search);
const dark = params.get('theme') === 'dark';
const locale = params.get('lang') === 'en' ? 'en' : 'fr';
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.documentElement.lang = locale;

const root = document.getElementById('root');
if (root === null) throw new Error('#root manquant');
createRoot(root).render(
  <StrictMode>
    <Demo initialLocale={locale} initialDark={dark} />
  </StrictMode>,
);
