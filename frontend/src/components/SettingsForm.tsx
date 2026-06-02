import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../stores/auth';
import { authApi, ApiError, type MeDetails } from '../lib/api';
import { authT, type Locale } from '../lib/i18n/auth';

export default function SettingsForm({ locale }: { locale: Locale }) {
  const t = (k: keyof (typeof authT)['ja']) => authT[locale][k];
  const { init, patchUser, clear } = useAuth();
  const [details, setDetails] = useState<MeDetails | null>(null);
  const [gate, setGate] = useState<'loading' | 'ready'>('loading');

  // Bootstrap session, then load settings detail. Bounce guests to login.
  useEffect(() => {
    let alive = true;
    (async () => {
      await init();
      try {
        const d = await authApi.me();
        if (alive) {
          setDetails(d);
          setGate('ready');
        }
      } catch {
        window.location.href = `/${locale}/login`;
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errMsg = (code: string) =>
    authT[locale][`err.${code}` as keyof (typeof authT)['ja']] ?? t('err.network');

  if (gate === 'loading' || !details) {
    return <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-line" />;
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="font-serif text-[30px] text-ink">{t('set.title')}</h1>
        <p className="mt-1 text-[14px] text-mute">{t('set.subtitle')}</p>
      </div>

      <ProfileSection locale={locale} details={details} onSaved={(u) => { patchUser(u); setDetails({ ...details, user: { ...details.user, ...u } }); }} />

      {details.hasPassword ? (
        <PasswordSection locale={locale} />
      ) : (
        <Section title={t('set.pw.title')} desc={t('set.pw.google_only')}><span /></Section>
      )}

      <Section title={t('set.conn.title')} desc={t('set.conn.desc')}>
        <div className="flex items-center gap-3.5 rounded-xl border border-line p-3.5">
          <GoogleIcon />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-ink">Google</div>
            <div className="text-[12.5px] text-mute">
              {details.google.linked
                ? t('set.conn.linked').replace('{email}', details.google.email ?? '')
                : t('set.conn.unlinked')}
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
            details.google.linked ? 'bg-[#E7F4EC] text-[#2C7A4B]' : 'bg-line text-mute'
          }`}>
            {details.google.linked ? t('set.conn.badge_on') : t('set.conn.badge_off')}
          </span>
        </div>
      </Section>

      <DangerSection locale={locale} onDeleted={() => { clear(); window.location.href = `/${locale}/`; }} />

      <div className="mt-2 text-[13px]">
        <a href={`/${locale}/`} className="text-mute hover:text-hinomaru">{t('backhome')}</a>
      </div>
    </>
  );
}

/* ---------------- sections ---------------- */

function ProfileSection({ locale, details, onSaved }: {
  locale: Locale; details: MeDetails; onSaved: (u: { displayName: string }) => void;
}) {
  const t = (k: keyof (typeof authT)['ja']) => authT[locale][k];
  const [name, setName] = useState(details.user.displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      const u = await authApi.updateProfile(name.trim());
      onSaved({ displayName: u.displayName });
      setMsg(t('set.saved'));
    } catch (e) {
      setErr(e instanceof ApiError ? (authT[locale][`err.${e.code}` as any] ?? t('err.network')) : t('err.network'));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      <Section title={t('set.profile.title')} desc={t('set.profile.desc')}>
        {msg && <OkMsg>{msg}</OkMsg>}
        {err && <ErrMsg>{err}</ErrMsg>}
        <Field label={t('set.profile.name')}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Haru / はる" autoComplete="nickname" />
        </Field>
        <Field label={t('set.profile.email')}>
          <input className={inputCls} value={details.user.email} readOnly disabled />
          <p className="mt-1.5 text-[11.5px] text-mute">{t('set.profile.emailnote')}</p>
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? '…' : t('set.profile.save')}
          </button>
        </div>
      </Section>
    </form>
  );
}

function PasswordSection({ locale }: { locale: Locale }) {
  const t = (k: keyof (typeof authT)['ja']) => authT[locale][k];
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (pw.length < 8) return setErr(t('err.weak_password'));
    if (pw !== confirm) return setErr(t('err.mismatch'));
    setBusy(true);
    try {
      await authApi.changePassword(cur, pw);
      setMsg(t('set.pw.saved'));
      setCur(''); setPw(''); setConfirm('');
    } catch (e) {
      setErr(e instanceof ApiError ? (authT[locale][`err.${e.code}` as any] ?? t('err.network')) : t('err.network'));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      <Section title={t('set.pw.title')} desc={t('set.pw.desc')}>
        {msg && <OkMsg>{msg}</OkMsg>}
        {err && <ErrMsg>{err}</ErrMsg>}
        <Field label={t('set.pw.current')}>
          <input type="password" className={inputCls} value={cur} onChange={(e) => setCur(e.target.value)}
            autoComplete="current-password" placeholder="••••••••" />
        </Field>
        <Field label={t('set.pw.new')}>
          <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password" placeholder={t('set.pw.hint')} />
        </Field>
        <Field label={t('set.pw.confirm')}>
          <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" placeholder="••••••••" />
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? '…' : t('set.pw.save')}
          </button>
        </div>
      </Section>
    </form>
  );
}

function DangerSection({ locale, onDeleted }: { locale: Locale; onDeleted: () => void }) {
  const t = (k: keyof (typeof authT)['ja']) => authT[locale][k];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function del() {
    setBusy(true);
    try {
      await authApi.deleteAccount();
      onDeleted();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mb-[18px] rounded-2xl border border-[#F4C4CD] bg-[#FEFAFB] p-6">
      <h2 className="text-[16px] font-bold text-[#A21E36]">{t('set.danger.title')}</h2>
      <p className="mb-[18px] mt-0.5 text-[13px] text-mute">{t('set.danger.desc')}</p>
      {confirming ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-[13px] text-[#A21E36]">{t('set.danger.confirm')}</span>
          <div className="flex gap-2.5">
            <button disabled={busy} onClick={del} className={btnDanger}>
              {busy ? '…' : t('set.danger.yes')}
            </button>
            <button onClick={() => setConfirming(false)} className={btnGhost}>{t('set.danger.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className={btnDanger}>{t('set.danger.btn')}</button>
      )}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="mb-[18px] rounded-2xl border border-line bg-white p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      <p className="mb-[18px] mt-0.5 text-[13px] text-mute">{desc}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}

function OkMsg({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-[9px] border border-[#BFE3CD] bg-[#E7F4EC] px-3 py-[9px] text-[13px] text-[#2C7A4B]">{children}</div>;
}
function ErrMsg({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-[9px] border border-[#F4C4CD] bg-[#FCE9EC] px-3 py-[9px] text-[13px] text-[#A21E36]">{children}</div>;
}

const inputCls =
  'w-full rounded-[10px] border border-tan bg-white px-[13px] py-[11px] text-[15px] text-ink outline-none transition focus:border-hinomaru focus:ring-2 focus:ring-hinomaru/15 disabled:cursor-not-allowed disabled:bg-[#F5F2EC] disabled:text-mute';
const btnPrimary =
  'rounded-[10px] bg-hinomaru px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95 disabled:opacity-60';
const btnGhost =
  'rounded-[10px] border border-tan bg-white px-[18px] py-2.5 text-[14px] font-semibold text-ink transition hover:bg-[#FAF8F4]';
const btnDanger =
  'rounded-[10px] border border-[#F4C4CD] bg-white px-[18px] py-2.5 text-[14px] font-semibold text-[#A21E36] transition hover:bg-[#FCE9EC] disabled:opacity-60';

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v7.7h12.4c-.3 2-1.6 5-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.1z" />
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.3-8.8 2.3-6.4 0-11.8-3.7-13.7-9.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
