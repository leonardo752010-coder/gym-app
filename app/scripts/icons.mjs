// Crea le icone dell'app da risorse/Gym-app-icon.png (gorilla con corona viola, occhiali e camice, fondo nero puro, 1024x1024;
// = nuove-icone/icon-1024.png dal Drive, 2026-11-09). Il disegno arriva fino al bordo: il camice tocca il lato sinistro e quello in basso.
// Le icone si rifanno a ogni dev/build in public/icons (ignorata da git).
// (logo.b64 nella radice del repository resta per la vecchia cornice su GitHub Pages: qui non si usa piu'.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'risorse', 'Gym-app-icon.png');
const out = path.join(here, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
const BG = { r: 0, g: 0, b: 0, alpha: 1 };                // stesso nero del fondo dell'immagine
const PNG = { palette: true, quality: 90, compressionLevel: 9 };

const plain = (size, name) => sharp(src).resize(size, size).png(PNG).toFile(path.join(out, name));
// Maskable (Android): disegno ridotto (proporzioni intatte) su tela nera, appoggiato in basso a sinistra,
// cosi' il camice continua fino al bordo (al centro resterebbe tagliato da una riga dritta).
// Con 0.82 la punta della corona arriva al 31% dal centro, dentro il cerchio sicuro (40%); faccia ancora piu' dentro.
async function tile(size, name, scale) {
  const s = Math.round(size * scale);
  const art = await sharp(src).resize(s, s).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'southwest' }]).flatten({ background: BG }).png(PNG).toFile(path.join(out, name));
}
await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await tile(192, 'icon-maskable-192.png', 0.82);
await tile(512, 'icon-maskable-512.png', 0.82);
// iPhone: disegno intero fino al bordo (gli angoli li arrotonda iOS), come icon-180 del Drive
await plain(180, 'apple-touch-icon.png');
console.log('icone pronte in public/icons');
