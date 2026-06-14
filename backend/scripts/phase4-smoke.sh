#!/usr/bin/env bash
# Phase 4 smoke: For You feed + follow + notifications. Run from repo root via WSL.
set -e
B=http://localhost:8787
jq() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

login() { # email password -> token
  curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq 'd.get("access","")'
}

TOK=$(login kageloom@gmail.com REDACTED)
echo "kageloom token len: ${#TOK}"

# yuki's user id + handle (we'll follow her)
YUKI=$(curl -s "$B/users/yuki-shirakawa")
YUKI_ID=$(echo "$YUKI" | jq 'd["user"]["id"]')
echo "yuki id: $YUKI_ID  followers(before): $(echo "$YUKI" | jq 'd["stats"].get("followers")')"

echo "--- For You (logged out) ---"
curl -s "$B/feed?limit=3" | jq '("personalized",d["personalized"],"n",len(d["feed"]),"first",(d["feed"][0]["titleEn"][:40] if d["feed"] else None))'

echo "--- For You (logged in, before follow) ---"
curl -s "$B/feed?limit=3" -H "Authorization: Bearer $TOK" | jq '("personalized",d["personalized"],"n",len(d["feed"]))'

echo "--- follow yuki ---"
curl -s -X POST "$B/users/$YUKI_ID/follow" -H "Authorization: Bearer $TOK" | jq 'd'

echo "--- yuki profile now (as kageloom) ---"
curl -s "$B/users/yuki-shirakawa" -H "Authorization: Bearer $TOK" | jq '("isFollowing",d["isFollowing"],"followers",d["stats"].get("followers"))'

echo "--- yuki gets a follow notification ---"
YTOK=$(login yuki.writes@test.local nihon-test-2026)
curl -s "$B/notifications" -H "Authorization: Bearer $YTOK" | jq '("unread",d["unread"],"latest",(d["notifications"][0]["type"], d["notifications"][0]["actorHandle"]) if d["notifications"] else None)'

echo "--- unfollow yuki ---"
curl -s -X DELETE "$B/users/$YUKI_ID/follow" -H "Authorization: Bearer $TOK" | jq 'd'
