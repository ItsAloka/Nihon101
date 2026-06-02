import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../stores/auth';
import { authApi, ApiError } from '../lib/api';
import { authT, type Locale } from '../lib/i18n/auth';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const API = import.meta.env.PUBLIC_API_URL;

export default function AuthForm({ mode, locale }: { mode: Mode; locale: Locale }) {
  const t = (k: keyof (typeof authT)['ja']) => authT[locale][k];
  const { login, register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); // forgot: sent / reset: changed

  // reset token from the email link + surface ?error=google from a failed OAuth bounce
  const tokenRef = useRef<string>('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (mode === 'reset') tokenRef.current = params.get('token') ?? '';
    if (params.get('error') === 'google') setErr(t('err.google'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const errMsg = (code: string) => {
    const key = `err.${code}` as keyof (typeof authT)['ja'];
    return authT[locale][key] ?? t('err.network');
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && mode !== 'reset') {
      return setErr(t('err.invalid_email'));
    }
    if ((mode === 'register' || mode === 'reset') && password.length < 8) {
      return setErr(t('err.weak_password'));
    }
    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      return setErr(t('err.mismatch'));
    }
    if (mode === 'register' && !agree) return setErr(t('err.terms'));

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        window.location.href = `/${locale}/`;
      } else if (mode === 'register') {
        await register(email, password, name);
        window.location.href = `/${locale}/`;
      } else if (mode === 'forgot') {
        await authApi.forgot(email, locale);
        setDone(true);
      } else if (mode === 'reset') {
        await authApi.reset(tokenRef.current, password);
        setDone(true);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? errMsg(e.code) : t('err.network'));
    } finally {
      setBusy(false);
    }
  }

  // ---- success panels ----
  if (mode === 'forgot' && done) {
    return (
      <Panel emoji="📬" title={t('sent.title')} sub={t('sent.sub')}>
        <BackLink locale={locale} label={t('forgot.back')} />
      </Panel>
    );
  }
  if (mode === 'reset' && done) {
    return (
      <Panel emoji="🌸" title={t('reset.done.title')} sub={t('reset.done.sub')}>
        <a href={`/${locale}/login`} className="text-hinomaru font-medium text-sm hover:underline">
          {t('reset.gologin')}
        </a>
      </Panel>
    );
  }

  const titleKey =
    mode === 'login' ? 'login' : mode === 'register' ? 'reg' : mode === 'forgot' ? 'forgot' : 'reset';

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mx-auto mb-3.5 h-10 w-10 rounded-full" style={crest} />
      <h1 className="text-center font-serif text-[25px] text-ink">{t(`${titleKey}.title` as any)}</h1>
      <p className="mb-6 mt-1 text-center text-[13.5px] text-mute">{t(`${titleKey}.sub` as any)}</p>

      {err && (
        <div className="mb-[18px] rounded-[9px] border border-[#F4C4CD] bg-[#FCE9EC] px-3 py-[9px] text-[13px] text-[#A21E36]">
          {err}
        </div>
      )}

      {mode === 'register' && (
        <Field label={t('reg.name')}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Haru / はる" autoComplete="nickname" />
        </Field>
      )}

      {mode !== 'reset' && (
        <Field label={t('f.email')}>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" required />
        </Field>
      )}

      {mode !== 'forgot' && (
        <PasswordField
          label={mode === 'reset' ? t('reset.new') : t('f.password')}
          value={password} onChange={setPassword} capsLabel={t('f.caps')}
          showStrength={mode === 'register' || mode === 'reset'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      )}
      {mode === 'register' && <p className="-mt-3 mb-4 text-[11.5px] text-mute">{t('reg.pwhint')}</p>}

      {(mode === 'register' || mode === 'reset') && (
        <PasswordField label={t('f.confirm')} value={confirm} onChange={setConfirm}
          capsLabel={t('f.caps')} autoComplete="new-password" />
      )}

      {mode === 'login' && (
        <div className="-mt-0.5 mb-[18px] flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-mute">
            <input type="checkbox" className="h-[15px] w-[15px] accent-hinomaru" /> {t('login.remember')}
          </label>
          <a href={`/${locale}/forgot`} className="text-[13px] font-medium text-hinomaru hover:underline">
            {t('login.forgot')}
          </a>
        </div>
      )}

      {mode === 'register' && (
        <label className="mb-[18px] flex cursor-pointer items-start gap-1.5 text-[13px] text-mute">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-[15px] w-[15px] accent-hinomaru" />
          <span>{t('reg.terms')}</span>
        </label>
      )}

      <button type="submit" disabled={busy} className={btnPrimary}>
        {busy ? '…' : t(`${titleKey}.submit` as any)}
      </button>

      {(mode === 'login' || mode === 'register') && (
        <>
          <div className="my-[18px] flex items-center gap-3 text-[12px] text-mute before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            {t('or')}
          </div>
          <a href={`${API}/auth/google/start?locale=${locale}`} className={btnGoogle}>
            <GoogleIcon />
            {mode === 'login' ? t('login.google') : t('reg.google')}
          </a>
          <p className="mt-[22px] text-center text-[13.5px] text-mute">
            {mode === 'login' ? t('login.noacct') : t('reg.haveacct')}{' '}
            <a href={`/${locale}/${mode === 'login' ? 'register' : 'login'}`}
              className="font-medium text-hinomaru hover:underline">
              {mode === 'login' ? t('login.register') : t('reg.login')}
            </a>
          </p>
        </>
      )}

      {(mode === 'forgot' || mode === 'reset') && (
        <div className="mt-[22px] text-center">
          <BackLink locale={locale} label={t('forgot.back')} />
        </div>
      )}
    </form>
  );
}

/* ---------------- pieces ---------------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}

function PasswordField({
  label, value, onChange, capsLabel, showStrength, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  capsLabel: string; showStrength?: boolean; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const pct = Math.min(100, value.length * 12);
  const barColor = pct > 70 ? '#3FA66A' : pct > 40 ? '#E0A93B' : '#E8A0AE';
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'} className={inputCls} value={value}
          autoComplete={autoComplete} placeholder="••••••••"
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label="toggle password"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-mute">
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {showStrength && (
        <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      )}
      {caps && <p className="mt-1.5 text-[11.5px] text-hinomaru">{capsLabel}</p>}
    </div>
  );
}

function Panel({ emoji, title, sub, children }: {
  emoji: string; title: string; sub: string; children: ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="mb-2 text-[40px]">{emoji}</div>
      <h1 className="font-serif text-[25px] text-ink">{title}</h1>
      <p className="mb-5 mt-1 text-[13.5px] text-mute">{sub}</p>
      {children}
    </div>
  );
}

function BackLink({ locale, label }: { locale: Locale; label: string }) {
  return (
    <a href={`/${locale}/login`} className="text-[13px] font-medium text-hinomaru hover:underline">
      {label}
    </a>
  );
}

const inputCls =
  'w-full rounded-[10px] border border-tan bg-white px-[13px] py-[11px] text-[15px] text-ink outline-none transition focus:border-hinomaru focus:ring-2 focus:ring-hinomaru/15';
const btnPrimary =
  'w-full rounded-[10px] bg-hinomaru py-3 text-[15px] font-semibold text-white transition hover:brightness-95 disabled:opacity-60';
const btnGoogle =
  'mt-3 flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-tan bg-white py-3 text-[15px] font-semibold text-ink transition hover:bg-[#FAF8F4]';
const crest = { background: 'radial-gradient(circle at 35% 30%, #fff, #D63752 70%)' };

function Eye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.16 3.19" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v7.7h12.4c-.3 2-1.6 5-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.1z" />
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.3-8.8 2.3-6.4 0-11.8-3.7-13.7-9.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
