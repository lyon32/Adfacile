#!/usr/bin/env node
/**
 * generer-medias-test.cjs — Médias de test conformes (ou volontairement non
 * conformes) aux règles Meta, pour les essais locaux de création.
 *
 * Utilise ffmpeg-static (dépendance de développement) : aucun ffmpeg système.
 *
 * Usage : node scripts/generer-medias-test.cjs [dossier]   (défaut : tmp/medias-test)
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const dossier = path.resolve(process.argv[2] || path.join(__dirname, '../tmp/medias-test'));
fs.mkdirSync(dossier, { recursive: true });

// Police explicite : sans elle, ffmpeg-static cherche une config Fontconfig absente sous Windows.
const ARIAL = 'C:/Windows/Fonts/arial.ttf';
const police = fs.existsSync(ARIAL) ? `fontfile='${ARIAL.replace(':', '\:')}':` : '';

const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]);

// Vidéo H.264 + AAC, couleur unie + bip, la durée et la taille données.
const video = (nom, secondes, w, h, couleur) => run([
    '-f', 'lavfi', '-i', `color=c=${couleur}:s=${w}x${h}:d=${secondes}:r=30`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${secondes}`,
    '-vf', `drawtext=${police}text='AdsFacile ${nom}':fontcolor=white:fontsize=${Math.round(h / 12)}:x=(w-tw)/2:y=(h-th)/2`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    '-movflags', '+faststart', path.join(dossier, `${nom}.mp4`)
]);

const image = (nom, w, h, couleur) => run([
    '-f', 'lavfi', '-i', `color=c=${couleur}:s=${w}x${h}`,
    '-vf', `drawtext=${police}text='${nom}':fontcolor=white:fontsize=${Math.round(h / 10)}:x=(w-tw)/2:y=(h-th)/2`,
    '-frames:v', '1', path.join(dossier, `${nom}.png`)
]);

video('video-6s-1080x1080', 6, 1080, 1080, '0x0f766e');
video('video-6s-1080x1920', 6, 1080, 1920, '0x1e3a8a');
video('video-0-5s', 0.5, 1080, 1080, '0x7f1d1d');
image('image-1080x1080-a', 1080, 1080, '0x065f46');
image('image-1080x1080-b', 1080, 1080, '0x334155');
image('image-1080x1080-c', 1080, 1080, '0x7c2d12');
image('image-1440x1800', 1440, 1800, '0x1f2937');
image('image-500x500', 500, 500, '0x991b1b');

for (const f of fs.readdirSync(dossier)) {
    console.log(`${f}\t${(fs.statSync(path.join(dossier, f)).size / 1024).toFixed(0)} Ko`);
}
