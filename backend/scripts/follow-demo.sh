#!/usr/bin/env bash
# Seed a few follow edges so the Readers/Writers modal has content to show.
set -e
B=http://localhost:8787
jq() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
login() { curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq 'd["access"]'; }

K=$(login kageloom@gmail.com snaloka20040310sn)
Y=$(login yuki.writes@test.local nihon-test-2026)
KE=$(login kenta.eats@test.local nihon-test-2026)
M=$(login mari.travels@test.local nihon-test-2026)
R=$(login ren.frames@test.local nihon-test-2026)

# kageloom follows yuki + kenta + mari (kageloom's "Writers")
for h in yuki-shirakawa kenta-hori mari-aoki; do curl -s -X POST "$B/users/$h/follow" -H "Authorization: Bearer $K" -o /dev/null; done
# yuki, kenta, mari, ren follow kageloom (kageloom's "Readers")
for t in "$Y" "$KE" "$M" "$R"; do curl -s -X POST "$B/users/kage-loom/follow" -H "Authorization: Bearer $t" -o /dev/null; done

echo "kageloom counts:"; curl -s "$B/users/kage-loom" | jq '("followers", d["stats"].get("followers"), "following", d["stats"].get("following"))'
