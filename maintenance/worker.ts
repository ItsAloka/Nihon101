// nihon101 — maintenance-mode worker (standalone, no app assets).
// Deploy this with the nihon101.com/* route to enter maintenance; `wrangler
// delete` (removes worker + route) to hand traffic back to the real site.

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>nihon101 — メンテナンス中 / Maintenance</title>
<style>
  :root{
    --bg:#FBFAF7; --line:#ECE8E0; --ink:#1A1817; --inkSoft:#5C544C; --inkFaint:#A39F98;
    --stamp:#D63752; --accent:#F58FA3; --tint:#FCE5EA;
    --font:'Inter','Noto Sans JP',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    --mono:'JetBrains Mono',ui-monospace,Consolas,monospace;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;font-family:var(--font);color:var(--ink);
    background:radial-gradient(120% 120% at 50% 0%,var(--tint) 0%,var(--bg) 55%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;padding:32px}
  .wm{position:fixed;top:28px;left:0;right:0;font-weight:800;font-size:19px;letter-spacing:-.01em}
  .wm b{color:var(--stamp)}
  .stack{display:flex;flex-direction:column;align-items:center;max-width:560px}
  .logo{width:112px;height:112px;animation:bob 5s ease-in-out infinite;transform-origin:center}
  @keyframes bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-9px) rotate(3deg)}}
  h1{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:22px 0 12px}
  p{color:var(--inkSoft);font-size:16px;line-height:1.7;max-width:420px}
  p+p{margin-top:8px}
  .foot{position:fixed;bottom:24px;left:0;right:0;font-family:var(--mono);
    font-size:11px;letter-spacing:.06em;color:var(--inkFaint)}
  @media(max-width:480px){h1{font-size:23px}p{font-size:15px}.logo{width:92px;height:92px}}
</style>
</head>
<body>
  <div class="wm">nihon<b>101</b></div>
  <div class="stack">
    <svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="nihon101">
      <rect width="64" height="64" rx="14" fill="#FFFFFF"/>
      <circle cx="32" cy="32" r="12" fill="#D63752"/>
      <path id="one" d="M16 19 L16 42 L19 42 L19 46 L7 46 L7 42 L10 42 L10 23 L6.5 24.5 L5.5 21 Z" fill="#1A1817"/>
      <use href="#one" transform="translate(38,0)"/>
    </svg>
    <h1>ただいまメンテナンス中です</h1>
    <p>すぐに戻ります。お茶でも一杯どうぞ。</p>
    <p>nihon101 is down for a quick tune-up. Have a cup of tea — we'll be back in a few minutes.</p>
  </div>
  <div class="foot">nihon101.com &middot; maintenance</div>
</body>
</html>`;

export default {
  async fetch(): Promise<Response> {
    return new Response(HTML, {
      status: 503,
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'no-store',
        'Retry-After': '3600',
      },
    });
  },
};
