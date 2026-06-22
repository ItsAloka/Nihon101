// Wired contact form for the SSR /[locale]/contact page. Mirrors the prototype
// ContactPage card (name/email/topic/message → "届 message sent") but posts to the
// real backend (/contact). Uses Shell's CSS variables so it themes with the page
// (light/dark) without pulling in the palette JS.
import React from "react";
import "./api.jsx";      // window.N101_API
import "./content.jsx";  // window.N101_CONTENT (contactApi)

const v = (name) => `var(${name})`;
const input = {
  width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${v("--line")}`,
  background: v("--bg"), color: v("--ink"), fontFamily: v("--fontBody"), fontSize: 15, outline: "none",
};

export default function ContactIsland({ locale }) {
  const jp = locale === "ja";
  const [form, setForm] = React.useState({ name: "", email: "", topic: "general", message: "" });
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [website, setWebsite] = React.useState(""); // honeypot

  // Prefill from the session if the visitor is signed in.
  React.useEffect(() => {
    window.N101_API.refresh()
      .then((u) => setForm((f) => ({ ...f, name: f.name || u.displayName || "", email: f.email || u.email || "" })))
      .catch(() => {});
  }, []);

  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));
  const valid = form.name.trim() && form.email.includes("@") && form.message.trim();
  const topics = [
    ["general", jp ? "ふつうの用件" : "General"],
    ["pitch", jp ? "寄稿したい" : "Pitch a story"],
    ["bug", jp ? "不具合の報告" : "Report a bug"],
    ["press", jp ? "取材・お仕事" : "Press / business"],
  ];
  const topicLabel = Object.fromEntries(topics);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr("");
    // Backend has no topic field — fold it into the message so nothing is lost.
    const message = `[${topicLabel[form.topic]}]\n\n${form.message.trim()}`;
    try {
      await window.N101_CONTENT.contactApi.send({ name: form.name.trim(), email: form.email.trim(), message, locale, website });
      setSent(true);
    } catch (e) {
      setErr(e?.code === "rate_limited" ? (jp ? "送信が多すぎます。少し待ってください。" : "Too many sends — please wait a moment.")
                                        : (jp ? "送信できませんでした。もう一度お試しください。" : "Couldn't send — please try again."));
    } finally { setBusy(false); }
  };

  if (sent) return (
    <div style={{ textAlign: "center", padding: "48px 12px" }}>
      <div style={{ width: 84, height: 84, margin: "0 auto", borderRadius: "16%", border: `3px solid ${v("--stamp")}`, color: v("--stamp"), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: v("--fontDisplay"), fontWeight: 700, fontSize: 40, transform: "rotate(-6deg)" }}>届</div>
      <h3 style={{ fontFamily: v("--fontDisplay"), fontWeight: 600, fontSize: 28, color: v("--ink"), marginTop: 24, marginBottom: 10 }}>{jp ? "届きました。" : "Message sent."}</h3>
      <p style={{ fontFamily: v("--fontBody"), fontSize: 15, color: v("--inkSoft"), marginBottom: 20 }}>{jp ? "数日以内にお返事します。" : "We'll get back to you within a few days."}</p>
      <button onClick={() => { setSent(false); setForm({ name: form.name, email: form.email, topic: "general", message: "" }); }}
        style={{ border: `1px solid ${v("--line")}`, background: v("--surface"), color: v("--ink"), padding: "10px 20px", borderRadius: 999, cursor: "pointer", fontFamily: v("--fontBody"), fontSize: 13, fontWeight: 600 }}>
        {jp ? "もう一通送る" : "Send another"}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <label style={{ display: "block" }}>
          <span style={lbl}>{jp ? "お名前" : "Your name"}</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={jp ? "山田 太郎" : "Jane Doe"} style={input} />
        </label>
        <label style={{ display: "block" }}>
          <span style={lbl}>{jp ? "メール" : "Email"}</span>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" style={input} />
        </label>
      </div>
      <div style={{ marginBottom: 14 }}>
        <span style={lbl}>{jp ? "ご用件" : "Topic"}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topics.map(([k, label]) => (
            <button key={k} onClick={() => set("topic", k)} style={{
              cursor: "pointer", padding: "8px 14px", borderRadius: 999,
              border: `1px solid ${form.topic === k ? v("--ink") : v("--line")}`, background: form.topic === k ? v("--ink") : v("--bg"),
              color: form.topic === k ? v("--surface") : v("--ink"), fontFamily: v("--fontBody"), fontSize: 13, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
      </div>
      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={lbl}>{jp ? "メッセージ" : "Message"}</span>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={6}
          placeholder={jp ? "ご自由にどうぞ…" : "Tell us what's on your mind…"} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
      </label>
      {/* Honeypot — hidden from humans, bots fill it. */}
      <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
      {err && <div style={{ color: "#c0392b", fontFamily: v("--fontBody"), fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button disabled={!valid || busy} onClick={submit} style={{
        width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center",
        background: `linear-gradient(135deg, ${v("--accent")}, ${v("--accentDeep")})`, color: "#fff", border: "none", padding: "13px 22px", borderRadius: 999,
        fontFamily: v("--fontBody"), fontSize: 14, fontWeight: 600, cursor: valid && !busy ? "pointer" : "default", opacity: valid && !busy ? 1 : 0.5,
      }}>{busy ? "…" : (jp ? "送信する" : "Send message")}</button>
    </div>
  );
}

const lbl = { display: "block", fontFamily: "var(--fontMono)", fontSize: 11, color: "var(--inkFaint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7 };
