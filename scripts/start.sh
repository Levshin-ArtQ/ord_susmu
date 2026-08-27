#!/bin/sh
cd "$(dirname "$0")/.."
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -z "$IP" ]; then
  IP=$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')
fi
[ -z "$IP" ] && IP=127.0.0.1
printf 'window.LAN_URL="http://%s:8767";\n' "$IP" > data/lan.js
echo ""
echo "  Компьютер:  http://127.0.0.1:8767"
echo "  Телефон:    http://$IP:8767"
echo "  (тот же Wi‑Fi, обязательно http:// — не https)"
echo ""
exec python3 -m http.server 8767 --bind 0.0.0.0
