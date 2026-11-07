// Prepara il logo usato DENTRO l'app da risorse/Gym-logo-silverback-v5.png (1254x1254, fondo nero puro).
// Si lancia a mano (node scripts/logo.mjs) solo se cambia il logo: l'originale resta sul computer di Leonardo
// (non su GitHub); i due file pronti stanno in src/assets/logo/ e sono nel repository.
// - logo-silverback.webp: logo completo (gorilla, bilanciere, "Gym", "IMPORT & TRACK"), tolto solo il nero vuoto
//   intorno e lasciato un margine nero uguale su tutti i lati. Per accesso, caricamento e menu.
// - logo-gorilla.webp: ritaglio quadrato del solo gorilla con bilanciere (senza scritta), su nero, per il
//   cerchio piccolo in alto: tutto il disegno sta dentro il cerchio, niente tagliato.
// Niente stiramenti, stessi colori: solo ritaglio, nero aggiunto e riduzione.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'risorse', 'Gym-logo-silverback-v5.png');
const out = path.join(here, '..', 'src', 'assets', 'logo');
fs.mkdirSync(out, { recursive: true });
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const WEBP = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true };

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, C = info.channels;
const on = (x, y) => { const i = (y * W + x) * C; return Math.max(data[i], data[i + 1], data[i + 2]) > 24; };
const box = (x0, y0, x1, y1) => {           // riquadro del disegno dentro una zona
  const b = [x1, y1, x0, y0];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
};

// 1. logo completo
{
  const [x0, y0, x1, y1] = box(0, 0, W - 1, info.height - 1);
  const m = Math.round((x1 - x0 + 1) * 0.06);
  const art = await sharp(src).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).toBuffer();
  const big = await sharp(art).extend({ top: m, bottom: m, left: m, right: m, background: BLACK }).png().toBuffer();   // prima il bordo, poi la riduzione
  await sharp(big).resize({ width: 720 })
    .webp(WEBP).toFile(path.join(out, 'logo-silverback.webp'));
}

// 2. solo il gorilla (misurato: i piedi finiscono alla riga 601, la "y" di "Gym" comincia alla 602)
{
  const [x0, y0, x1, y1] = box(600, 0, W - 1, 601);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let r = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) r = Math.max(r, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  const side = Math.ceil((2 * r) / 0.92);       // il punto più lontano resta al 46% del lato: dentro il cerchio
  const art = await sharp(src).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).toBuffer();
  const padL = Math.round(side / 2 - (cx - x0)), padT = Math.round(side / 2 - (cy - y0));
  const sq = await sharp(art).extend({ top: padT, left: padL, bottom: side - padT - (y1 - y0 + 1), right: side - padL - (x1 - x0 + 1), background: BLACK }).png().toBuffer();
  await sharp(sq).resize(384, 384).webp(WEBP).toFile(path.join(out, 'logo-gorilla.webp'));
  console.log('gorilla: riquadro', [x0, y0, x1, y1], 'raggio', r.toFixed(0), 'lato', side);
}
for (const f of fs.readdirSync(out)) { const m = await sharp(path.join(out, f)).metadata(); console.log(f, m.width + 'x' + m.height, fs.statSync(path.join(out, f)).size + ' byte'); }
