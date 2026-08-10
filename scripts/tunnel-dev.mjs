#!/usr/bin/env node
/**
 * Tunnel de développement pour le retour d'authentification Facebook
 *
 * L'application Meta est en mode Live, où Facebook refuse localhost comme URI
 * de redirection — et refuse aussi qu'on l'y ajoute, localhost n'étant accepté
 * qu'en mode Développement. Le retour doit donc arriver sur une URL publique en
 * HTTPS.
 *
 * Ce script ouvre le tunnel, lit l'URL qu'il obtient, l'inscrit dans
 * backend/.env, redémarre le backend, et affiche l'URL à coller dans les
 * réglages de l'application Meta. C'est la seule étape qui reste manuelle :
 * l'API Graph n'expose pas l'écriture des URI de redirection.
 *
 *   node scripts/tunnel-dev.mjs
 *
 * Le tunnel reste ouvert tant que le script tourne. Ctrl+C l'arrête.
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(RACINE, 'backend', '.env');
const OUTILS = join(RACINE, '.tools');
const BINAIRE = join(OUTILS, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const PORT = 5173;

const couleur = (c, t) => `[${c}m${t}[0m`;
const info = (t) => console.log(couleur('36', '│ ') + t);
const ok = (t) => console.log(couleur('32', '│ ✓ ') + t);
const alerte = (t) => console.log(couleur('33', '│ ! ') + t);

/** Télécharge cloudflared au premier lancement. Aucune installation système. */
function telecharger() {
    const cibles = {
        win32: 'cloudflared-windows-amd64.exe',
        darwin: 'cloudflared-darwin-amd64.tgz',
        linux: 'cloudflared-linux-amd64'
    };
    const fichier = cibles[process.platform];
    if (!fichier) throw new Error(`Plateforme non prise en charge : ${process.platform}`);

    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${fichier}`;
    info(`Téléchargement de cloudflared…`);
    mkdirSync(OUTILS, { recursive: true });

    return new Promise((resolve, reject) => {
        const suivre = (adresse) => https.get(adresse, (rep) => {
            if (rep.statusCode >= 300 && rep.statusCode < 400 && rep.headers.location) {
                return suivre(rep.headers.location);
            }
            if (rep.statusCode !== 200) return reject(new Error(`HTTP ${rep.statusCode}`));
            const morceaux = [];
            rep.on('data', (m) => morceaux.push(m));
            rep.on('end', () => {
                writeFileSync(BINAIRE, Buffer.concat(morceaux));
                if (process.platform !== 'win32') execSync(`chmod +x "${BINAIRE}"`);
                ok('cloudflared prêt');
                resolve();
            });
        }).on('error', reject);
        suivre(url);
    });
}

/** Écrit la nouvelle URL de retour dans backend/.env. */
function inscrireDansEnv(url) {
    const rappel = `${url}/api/facebook/callback`;
    let contenu = readFileSync(ENV, 'utf8');
    const ligne = `FACEBOOK_REDIRECT_URI=${rappel}`;

    contenu = /^FACEBOOK_REDIRECT_URI=.*$/m.test(contenu)
        ? contenu.replace(/^FACEBOOK_REDIRECT_URI=.*$/m, ligne)
        : `${contenu.trimEnd()}\n${ligne}\n`;

    writeFileSync(ENV, contenu);
    ok(`backend/.env mis à jour`);
    return rappel;
}

/** Redémarre le backend pour qu'il relise .env. */
function redemarrerBackend() {
    try {
        execSync('docker compose up -d --build backend', { cwd: RACINE, stdio: 'ignore' });
        ok('backend redémarré');
    } catch {
        alerte('backend non redémarré — relancez-le à la main pour qu\'il relise .env');
    }
}

async function main() {
    console.log(couleur('36', '\n┌─ Tunnel de développement AdsFacile'));

    if (!existsSync(ENV)) {
        console.error(`backend/.env introuvable : ${ENV}`);
        process.exit(1);
    }
    if (!existsSync(BINAIRE)) await telecharger();

    info(`Ouverture du tunnel vers http://localhost:${PORT}…`);
    const tunnel = spawn(BINAIRE, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'],
        { stdio: ['ignore', 'pipe', 'pipe'] });

    let trouve = false;
    const lire = (donnees) => {
        const texte = donnees.toString();
        const m = texte.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && !trouve) {
            trouve = true;
            const rappel = inscrireDansEnv(m[0]);
            redemarrerBackend();

            console.log(couleur('36', '│'));
            console.log(couleur('32', '│ URL à coller dans les réglages de votre application Meta :'));
            console.log(couleur('1', `│   ${rappel}`));
            console.log(couleur('36', '│'));
            console.log(couleur('36', '│ developers.facebook.com/apps/<APP_ID>/fb-login/settings/'));
            console.log(couleur('36', '│ Champ « URI de redirection OAuth valides »'));
            console.log(couleur('36', '│'));
            console.log(couleur('33', '│ Le tunnel reste ouvert tant que ce script tourne. Ctrl+C pour arrêter.'));
            console.log(couleur('36', '└─\n'));
        }
    };

    tunnel.stdout.on('data', lire);
    tunnel.stderr.on('data', lire);

    const arreter = () => { tunnel.kill(); process.exit(0); };
    process.on('SIGINT', arreter);
    process.on('SIGTERM', arreter);

    tunnel.on('exit', (code) => {
        alerte(`Tunnel fermé (code ${code}). La connexion Facebook ne fonctionnera plus.`);
        process.exit(code ?? 0);
    });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
