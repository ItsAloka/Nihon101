import React from "react";
import "./api.jsx"; // registers window.N101_API in THIS island's bundle

const T = (loc, ja, en) => (loc === "ja" ? ja : en);

/** Landing page for the emailed verification link. Reads ?token=, confirms it
 *  against the backend, and reports the outcome. On an invalid/expired token it
 *  offers to resend (which needs a live session, restored from the refresh cookie). */
export default function VerifyEmail({ locale = "ja" }) {
  const [state, setState] = React.useState("checking"); // checking|ok|invalid|error|missing
  const [resent, setResent] = React.useState("");        // ''|sending|sent|signin|failed

  React.useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("missing"); return; }
    window.N101_API.verifyEmail(token)
      .then(() => setState("ok"))
      .catch((e) => setState(e && e.code === "invalid_token" ? "invalid" : "error"));
  }, []);

  const resend = async () => {
    setResent("sending");
    const api = window.N101_API;
    try { await api.refresh(); } catch { /* no session */ }
    if (!api.getAccessToken()) { setResent("signin"); return; }
    try { await api.resendVerification(); setResent("sent"); }
    catch { setResent("failed"); }
  };

  const home = `/${locale}/`;
  const title =
    state === "ok" ? T(locale, "メールを確認しました", "Email verified")
    : state === "checking" ? T(locale, "確認しています…", "Verifying…")
    : state === "missing" ? T(locale, "リンクが不正です", "Invalid link")
    : T(locale, "確認できませんでした", "Couldn't verify");

  const body =
    state === "ok" ? T(locale, "ありがとうございます。アカウントの確認が完了しました。", "Thanks — your account is now verified.")
    : state === "checking" ? T(locale, "少々お待ちください。", "One moment.")
    : state === "missing" ? T(locale, "確認トークンが見つかりません。メール内のボタンからもう一度お試しください。", "No verification token found. Use the button in the email again.")
    : state === "invalid" ? T(locale, "リンクの有効期限が切れているか、すでに使用されています。", "This link has expired or was already used.")
    : T(locale, "問題が発生しました。もう一度お試しください。", "Something went wrong. Please try again.");

  return (
    <div className="vfy">
      <div className={"vfy-mark " + state}>{state === "ok" ? "✓" : state === "checking" ? "…" : "!"}</div>
      <h1 className="vfy-h">{title}</h1>
      <p className="vfy-p">{body}</p>

      {(state === "invalid" || state === "error") && (
        <div className="vfy-actions">
          {resent === "sent"
            ? <p className="vfy-note">{T(locale, "新しい確認メールを送信しました。", "A fresh verification email is on its way.")}</p>
            : resent === "signin"
              ? <p className="vfy-note">{T(locale, "再送するにはサインインしてください。", "Sign in first to resend the email.")}</p>
              : resent === "failed"
                ? <p className="vfy-note">{T(locale, "送信に失敗しました。あとでもう一度お試しください。", "Couldn't resend — try again later.")}</p>
                : <button className="vfy-btn" disabled={resent === "sending"} onClick={resend}>
                    {resent === "sending" ? T(locale, "送信中…", "Sending…") : T(locale, "確認メールを再送", "Resend verification email")}
                  </button>}
        </div>
      )}

      {state === "ok" && <a className="vfy-btn primary" href={home}>{T(locale, "ホームへ", "Go home")}</a>}
    </div>
  );
}
