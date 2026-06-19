import React from "react";
import "./api.jsx"; // registers window.N101_API in THIS island's bundle

const T = (loc, ja, en) => (loc === "ja" ? ja : en);

const field = {
  width: "100%", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px",
  background: "var(--surface)", fontFamily: "var(--fontBody)", fontSize: 15, color: "var(--ink)", outline: "none",
};
const label = {
  display: "block", fontFamily: "var(--fontMono)", fontSize: 11, color: "var(--inkSoft)",
  letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, textAlign: "left",
};

/** Landing page for the emailed reset link (/{loc}/reset?token=…). Reads ?token=,
 *  lets the user set a new password, then sends them to sign in. */
export default function ResetPassword({ locale = "ja" }) {
  const jp = locale === "ja";
  const [token, setToken] = React.useState(null); // null until read; '' = missing
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (pw !== confirm) { setErr(T(locale, "パスワードが一致しません。", "Passwords do not match.")); return; }
    setErr(""); setBusy(true);
    try {
      await window.N101_API.resetPassword(token, pw);
      setDone(true);
    } catch (ex) {
      setErr(ex && ex.code === "weak_password"
        ? T(locale, "パスワードは8〜72文字。英字に数字か記号を混ぜてください（または12文字以上）。", "Password must be 8–72 chars and mix letters with numbers or symbols (or be 12+ long).")
        : T(locale, "このリンクは無効か期限切れです。もう一度お試しください。", "This link is invalid or has expired. Request a new one."));
      setBusy(false);
    }
  };

  const home = `/${locale}/`;

  if (token === null) return null; // reading token

  return (
    <div className="rst">
      <h1 className="rst-h">{done ? T(locale, "パスワードを再設定しました", "Password reset") : T(locale, "新しいパスワードを設定", "Set a new password")}</h1>

      {done ? (
        <>
          <p className="rst-p">{T(locale, "新しいパスワードでログインできます。", "You can now sign in with your new password.")}</p>
          <a href={home} className="rst-btn primary">{T(locale, "ホームへ", "Go to sign in")}</a>
        </>
      ) : !token ? (
        <>
          <p className="rst-p">{T(locale, "リンクにトークンがありません。ログイン画面から再設定をやり直してください。", "This link is missing its token. Request a new reset link from the sign-in screen.")}</p>
          <a href={home} className="rst-btn">{T(locale, "ホームへ", "Go home")}</a>
        </>
      ) : (
        <form onSubmit={submit} style={{ textAlign: "left" }}>
          <label style={label}>{T(locale, "新しいパスワード", "New password")}</label>
          <input style={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
          <label style={{ ...label, marginTop: 14 }}>{T(locale, "新しいパスワード（確認）", "Confirm new password")}</label>
          <input style={field} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {err && <div style={{ marginTop: 12, fontFamily: "var(--fontBody)", fontSize: 13, color: "var(--stamp)" }}>{err}</div>}
          <button type="submit" disabled={busy} className="rst-btn primary" style={{ width: "100%", marginTop: 20, opacity: busy ? 0.6 : 1 }}>
            {busy ? T(locale, "保存中…", "Saving…") : T(locale, "パスワードを再設定", "Reset password")}
          </button>
        </form>
      )}
    </div>
  );
}
