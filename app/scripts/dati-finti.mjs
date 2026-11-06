// Prepara il database LOCALE per provare l'app a mano: atleta finto con piano e storico finti.
// Uso: npm run dati-finti   (poi npm run dev e accedi con email e password scritte in app/.env.locale)
import { localStatus, writeEnvLocale } from './locale.mjs';
import { adminClient, createFakeAthlete, deleteFakeAthlete, randomPassword } from './finti-lib.mjs';
import { localDate } from '../src/logic.js';

const EMAIL = 'prova.app@example.test';
const s = localStatus();
const admin = adminClient(s);
const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
for (const u of data.users.filter((u) => u.email === EMAIL)) await deleteFakeAthlete(admin, u.id);
const password = randomPassword();
const ref = await createFakeAthlete(admin, { email: EMAIL, password, today: localDate() });
writeEnvLocale({ TEST_EMAIL: EMAIL, TEST_PASSWORD: password });
console.log('Atleta finto pronto (solo database locale):', EMAIL, '· piano di 4 giorni, 6 sedute passate.');
console.log('Email e password: in app/.env.locale (file ignorato da git).');
console.log('Id utente:', ref.userId);
