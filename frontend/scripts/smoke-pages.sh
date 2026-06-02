#!/usr/bin/env bash
set -u
B=localhost:4399
for p in ja/login ja/register ja/forgot ja/reset en/login en/register en/forgot en/reset; do
  code=$(curl -s -o /tmp/pg.html -w '%{http_code}' "$B/$p")
  bad=$(grep -oE 'Cannot find|is not exported|Internal Server Error|ReferenceError' /tmp/pg.html | head -1)
  echo "$p -> $code ${bad:+[!! $bad]}"
done
echo "--- en/login content sniff ---"
curl -s "$B/en/login" | grep -oE 'Log in|Continue with Google|nihon|data-astro-cid' | sort -u | head
