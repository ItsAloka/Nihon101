import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../stores/auth';
import type { Locale } from '../lib/i18n/auth';

const nav = {
  ja: { login: 'ログイン', signup: '新規登録', logout: 'ログアウト', account: 'アカウント' },
  en: { login: 'Log in', signup: 'Sign up', logout: 'Log out', account: 'Account' },
} satisfies Record<Locale, Record<string, string>>;

export default function SiteHeader({ locale }: { locale: Locale }) {
  const { user, status, init, logout } = useAuth();
  const t = nav[locale];
  const other: Locale = locale === 'ja' ? 'en' : 'ja';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const otherHref =
    typeof window !== 'undefined'
      ? window.location.pathname.replace(/^\/(ja|en)/, `/${other}`)
      : `/${other}/`;

  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-3.5 sm:px-7">
      <a href={`/${locale}/`} className="font-serif text-2xl font-bold text-ink">
        nihon<span className="text-hinomaru">101</span>
      </a>

      <div className="flex items-center gap-3">
        <div className="flex overflow-hidden rounded-full border border-line bg-white text-[13px] font-semibold">
          <a href={`/${locale}/`} className={chip(locale === 'ja')}>日本語</a>
          <a href={otherHref} className={chip(locale === 'en')}>EN</a>
        </div>

        {status === 'loading' && <div className="h-9 w-9 animate-pulse rounded-full bg-line" />}

        {status === 'guest' && (
          <div className="flex items-center gap-2">
            <a href={`/${locale}/login`} className="text-[14px] font-medium text-ink hover:text-hinomaru">
              {t.login}
            </a>
            <a href={`/${locale}/register`}
              className="rounded-full bg-hinomaru px-4 py-1.5 text-[14px] font-semibold text-white transition hover:brightness-95">
              {t.signup}
            </a>
          </div>
        )}

        {status === 'authed' && user && (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 transition hover:bg-[#FAF8F4]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hinomaru text-[13px] font-bold text-white">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate text-[14px] font-medium text-ink">
                {user.displayName}
              </span>
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
                <div className="truncate px-4 py-2 text-[12px] text-mute">{user.email}</div>
                <div className="my-1 h-px bg-line" />
                <button onClick={() => void logout()}
                  className="block w-full px-4 py-2 text-left text-[14px] text-ink hover:bg-[#FAF8F4]">
                  {t.logout}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

const chip = (on: boolean) => `px-3.5 py-1.5 ${on ? 'bg-hinomaru text-white' : 'text-mute'}`;
