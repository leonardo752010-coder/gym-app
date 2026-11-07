// Accesso salvato che non vale più (account ricreato, sessione chiusa): l'app deve tornare al login,
// ma solo quando il server lo dice davvero. Senza rete si continua col telefono.
import { describe, it, expect } from 'vitest';
import { makeApi, authState, storedUser, AUTH_KEY } from '../../src/api.js';

const URL_ = 'https://example.invalid';
const now = () => Math.floor(Date.now() / 1000);

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

function session(expiresIn = 3600) {
  return JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r1', token_type: 'bearer', expires_in: expiresIn, expires_at: now() + expiresIn,
    user: { id: 'u-old', email: 'atleta@example.invalid', aud: 'authenticated' },
  });
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function api(fetchImpl, st) {
  return makeApi({ url: URL_, key: 'sb_publishable_test', fetch: fetchImpl, storage: st });
}

describe('authState', () => {
  it('risposte definitive → invalid', () => {
    expect(authState({ name: 'AuthSessionMissingError', status: 400 })).toBe('invalid');
    for (const code of ['refresh_token_not_found', 'session_not_found', 'user_not_found', 'bad_jwt']) expect(authState({ code, status: 400 })).toBe('invalid');
    expect(authState({ name: 'AuthApiError', status: 401 })).toBe('invalid');
    expect(authState({ name: 'AuthApiError', status: 403 })).toBe('invalid');
  });
  it('rete, server giù, troppe richieste → offline (non si esce)', () => {
    expect(authState({ name: 'AuthRetryableFetchError', status: 0 })).toBe('offline');
    expect(authState({ name: 'AuthApiError', status: 500 })).toBe('offline');
    expect(authState({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' })).toBe('offline');
    expect(authState({ name: 'AuthUnknownError', status: 200 })).toBe('offline');
  });
});

describe('checkAuth', () => {
  it('accesso valido → ok con lo stesso utente', async () => {
    const st = mem({ [AUTH_KEY]: session() });
    const a = api(async () => json(200, { id: 'u-old', email: 'atleta@example.invalid', aud: 'authenticated' }), st);
    const r = await a.checkAuth();
    expect(r.state).toBe('ok');
    expect(r.user.id).toBe('u-old');
  });

  it('account cancellato (token ancora valido) → invalid', async () => {
    const st = mem({ [AUTH_KEY]: session() });
    const a = api(async () => json(403, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }), st);
    expect((await a.checkAuth()).state).toBe('invalid');
  });

  it('sessione chiusa sul server → invalid', async () => {
    const st = mem({ [AUTH_KEY]: session() });
    const a = api(async () => json(403, { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }), st);
    expect((await a.checkAuth()).state).toBe('invalid');
  });

  it('token scaduto e refresh rifiutato → invalid', async () => {
    const st = mem({ [AUTH_KEY]: session(-60) });
    const a = api(async (u) => (String(u).includes('/token')
      ? json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' })
      : json(200, {})), st);
    expect((await a.checkAuth()).state).toBe('invalid');
  });

  it('senza rete (anche con token scaduto) → offline, e l\'accesso salvato resta', async () => {
    for (const exp of [3600, -60]) {
      const st = mem({ [AUTH_KEY]: session(exp) });
      const a = api(async () => { throw new TypeError('Failed to fetch'); }, st);
      expect((await a.checkAuth()).state).toBe('offline');
      expect(storedUser(st)).toEqual({ id: 'u-old', email: 'atleta@example.invalid' });
    }
  }, 90000);   // con token scaduto la libreria riprova il rinnovo per qualche secondo prima di arrendersi

  it('server giù (500) → offline', async () => {
    const st = mem({ [AUTH_KEY]: session() });
    const a = api(async () => json(500, { code: 500, msg: 'boom' }), st);
    expect((await a.checkAuth()).state).toBe('offline');
  });
});

describe('forgetSession', () => {
  it('toglie solo l\'accesso salvato, non gli altri dati del telefono', async () => {
    const st = mem({ [AUTH_KEY]: session(), 'gym.timer': '{"end":1}', 'gym.lang': 'it' });
    const a = api(async () => json(204, {}), st);
    await a.forgetSession();
    expect(storedUser(st)).toBeNull();
    expect(st.getItem(AUTH_KEY)).toBeNull();
    expect(st.getItem('gym.lang')).toBe('it');
    expect(st.getItem('gym.timer')).toBe('{"end":1}');
  });
});
