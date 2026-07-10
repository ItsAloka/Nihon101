#!/usr/bin/env bash
# Step 3 smoke: read a few food posts → taste vector → check feed similarity.
set -e
B=http://localhost:8787
: "${N101_EMAIL:?set N101_EMAIL}"
: "${N101_PW:?set N101_PW}"
jq() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

TOK=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$N101_EMAIL\",\"password\":\"$N101_PW\"}" | jq 'd["access"]')
echo "token len: ${#TOK}"

FOOD=$(curl -s "$B/search?cat=food&limit=3&loc=en" | jq '" ".join(p["id"] for p in d["posts"])')
echo "food posts: $FOOD"
for id in $FOOD; do curl -s -X POST "$B/feed/read/$id" -H "Authorization: Bearer $TOK" -o /dev/null; done
echo "recorded 3 food reads"

echo "--- feed (triggers taste-vector recompute) ---"
curl -s "$B/feed?limit=10" -H "Authorization: Bearer $TOK" | jq '("personalized", d["personalized"], "n", len(d["feed"]), "top5_cats", [p["categoryId"] for p in d["feed"][:5]])'
