#!/usr/bin/env bash
# Smoke test for the auth slice. Assumes wrangler dev is reachable on :8787.
set -u
B=localhost:8787
CJ=$(mktemp)
EMAIL="smoke$(date +%s)@nihon101.com"

echo "== register =="
curl -s -X POST $B/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"hunter2pass\",\"displayName\":\"Smoke\"}" -c "$CJ"
echo; echo

echo "== login =="
LOGIN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"hunter2pass\"}" -c "$CJ")
echo "$LOGIN"; echo
ACC=$(printf '%s' "$LOGIN" | grep -o '"access":"[^"]*"' | cut -d'"' -f4)

echo "== me (with access token) =="
curl -s $B/auth/me -H "Authorization: Bearer $ACC"; echo; echo

echo "== refresh (rotates cookie) =="
curl -s -X POST $B/auth/refresh -b "$CJ" -c "$CJ"; echo; echo

echo "== login wrong password (expect 401) =="
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"WRONGPASS\"}"

echo "== forgot (always ok) =="
curl -s -X POST $B/auth/forgot -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"locale\":\"ja\"}"; echo
