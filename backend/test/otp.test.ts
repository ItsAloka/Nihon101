/* Login OTP (2nd factor for password logins). Drives the real Worker against
 * Postgres. The code is mailed; with RESEND_API_KEY='' the mailer logs the HTML,
 * so we capture console.log during the login call and pull the 6 digits out. */
import { describe, it, expect, afterAll } from 'bun:test';
import { call, makeUser, deleteUsers } from './helpers';

const created: string[] = [];
afterAll(async () => { if (created.length) await deleteUsers(...created); });

const PW = 'Test-pass-1234';

/** Run `fn`, capturing the 6-digit OTP printed by the dev mailer (waitUntil send
 *  is settled inside `call`, so the log lands before this returns). */
async function withCode<T>(fn: () => Promise<T>): Promise<{ result: T; code: string }> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try {
    const result = await fn();
    // Pull the code from the email SUBJECT ("…ログインコード 123456" / "…login code
    // 123456"), which the dev mailer logs. Far more robust than scraping the code
    // out of the HTML body's inline styles — the email design can change freely
    // (e.g. the hanko codeSeal) without breaking this test.
    const m = lines.join('\n').match(/(?:ログインコード|login code)\s+(\d{6})/i);
    return { result, code: m ? m[1]! : '' };
  } finally { console.log = orig; }
}

/** Password login → expect the OTP gate. Returns { pending, code }. */
async function startLogin(email: string): Promise<{ pending: string; code: string }> {
  const { result, code } = await withCode(() => call('POST', '/auth/login', { body: { email, password: PW } }));
  expect(result.status).toBe(200);
  expect(result.json.otpRequired).toBe(true);
  expect(result.json.access).toBeUndefined();
  expect(code).toMatch(/^\d{6}$/);
  return { pending: result.json.pending, code };
}

describe('login OTP — second factor', () => {
  it('password login does not start a session; it mails a code', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    await startLogin(u.email);
  });

  it('wrong code is rejected, correct code signs in', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    const { pending, code } = await startLogin(u.email);

    const bad = await call('POST', '/auth/login/verify-otp', { body: { pending, code: '000000' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('invalid_code');

    const ok = await call('POST', '/auth/login/verify-otp', { body: { pending, code } });
    expect(ok.status).toBe(200);
    expect(ok.json.access).toBeTruthy();
    expect(ok.json.user.id).toBe(u.id);
  });

  it('a code is single-use', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    const { pending, code } = await startLogin(u.email);
    const first = await call('POST', '/auth/login/verify-otp', { body: { pending, code } });
    expect(first.status).toBe(200);
    const reuse = await call('POST', '/auth/login/verify-otp', { body: { pending, code } });
    expect(reuse.status).toBe(400);
    expect(reuse.json.error).toBe('otp_expired'); // used row no longer valid
  });

  it('caps wrong attempts then burns the code', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    const { pending } = await startLogin(u.email);
    // 5 wrong attempts are allowed (invalid_code), the 6th finds the code burned.
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/auth/login/verify-otp', { body: { pending, code: '111111' } });
      expect(r.json.error).toBe('invalid_code');
    }
    const sixth = await call('POST', '/auth/login/verify-otp', { body: { pending, code: '111111' } });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error).toBe('too_many_attempts');
  });

  it('resend issues a new code and invalidates the old one', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    const { pending, code: oldCode } = await startLogin(u.email);

    const { code: newCode } = await withCode(() => call('POST', '/auth/login/resend-otp', { body: { pending } }));
    expect(newCode).toMatch(/^\d{6}$/);

    // Old code no longer works (one pending per user — the resend replaced it)…
    if (newCode !== oldCode) {
      const stale = await call('POST', '/auth/login/verify-otp', { body: { pending, code: oldCode } });
      expect(stale.json.error).toBe('invalid_code');
    }
    // …the fresh code does.
    const ok = await call('POST', '/auth/login/verify-otp', { body: { pending, code: newCode } });
    expect(ok.status).toBe(200);
    expect(ok.json.access).toBeTruthy();
  });

  it('an invalid ticket is rejected', async () => {
    const r = await call('POST', '/auth/login/verify-otp', { body: { pending: 'garbage', code: '123456' } });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('otp_expired');
  });

  it('"remember this device" lets the next login skip OTP', async () => {
    const u = await makeUser('otp'); created.push(u.id);
    const { pending, code } = await startLogin(u.email);

    const ok = await call('POST', '/auth/login/verify-otp', { body: { pending, code, remember: true } });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get('set-cookie') || '';
    const m = setCookie.match(/n101_td=([^;]+)/);
    expect(m).toBeTruthy();

    // Re-login from the trusted device → straight session, no OTP gate.
    const again = await call('POST', '/auth/login', { body: { email: u.email, password: PW }, cookie: `n101_td=${m![1]}` });
    expect(again.status).toBe(200);
    expect(again.json.otpRequired).toBeUndefined();
    expect(again.json.access).toBeTruthy();
  });
});
