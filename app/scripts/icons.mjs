// Crea le icone dell'app dal logo del repository (logo.b64 = logo rotondo 512x512, salvato come testo).
// Così nel repository resta solo testo; le icone si rifanno a ogni build in public/icons (ignorata da git).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = Buffer.from(fs.readFileSync(path.join(here, '..', '..', 'logo.b64'), 'utf8').trim(), 'base64');
const out = path.join(here, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
const BG = { r: 22, g: 19, b: 14, alpha: 1 };             // stesso fondo scuro del logo

const plain = (size, name) => sharp(src).resize(size, size).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(path.join(out, name));
async function tile(size, name, scale) {                  // logo rotondo su fondo scuro (Android "maskable" e iPhone)
  const s = Math.round(size * scale);
  const badge = await sharp(src).resize(s, s).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: badge, gravity: 'center' }]).flatten({ background: BG }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(path.join(out, name));
}
await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await tile(512, 'icon-maskable-512.png', 0.8);
await tile(180, 'apple-touch-icon.png', 0.92);
console.log('icone pronte in public/icons');
