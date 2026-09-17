#!/bin/bash
# ═══ StarSeed · Túnel del Puente de Mando ═══════════════════════════════════
# Pedido por Alex (2026-09-17): «que el chat de Hermes envíe un mensaje con el
# enlace para abrir y vincular el Puente de Mando desde cualquier navegador».
#
# Mismo mecanismo que ya usa Astraura (tunnel_monitor.sh): un túnel rápido de
# cloudflared hacia el puerto 9002. La URL es aleatoria y cambia si el túnel se
# reinicia; por eso se guarda en ~/.starseed/tunel-mando.json y se avisa por
# Telegram cada vez que cambia — nunca se escribe en el repo ni en los docs.
#
# CUIDADO QUE HAY QUE TENER: el Mando puede aprobar, rechazar y soltar tareas.
# Con el túnel, cualquiera que tenga la URL llega a él. La URL es imposible de
# adivinar, pero NO es una contraseña: se comparte solo por el chat privado de
# Alex, y si se filtra se reinicia el túnel y sale otra.
set -u
PUERTO=9002
ESTADO="$HOME/.starseed/tunel-mando.json"
LOG="$HOME/.starseed/tunel-mando.log"
SALIDA="/tmp/mando_cloudflared.log"
mkdir -p "$HOME/.starseed"

# ¿Ya hay uno vivo y responde?
if [ -f "$ESTADO" ]; then
  URL=$(python3 -c "import json;print(json.load(open('$ESTADO')).get('url',''))" 2>/dev/null)
  if [ -n "$URL" ] && pgrep -f "cloudflared tunnel --url http://127.0.0.1:$PUERTO" >/dev/null 2>&1; then
    if curl -s -m 12 -o /dev/null -w '%{http_code}' "$URL/mando" | grep -qE '^(200|307|308)$'; then
      echo "$URL"; exit 0
    fi
  fi
fi

pkill -f "cloudflared tunnel --url http://127.0.0.1:$PUERTO" 2>/dev/null
: > "$SALIDA"
nohup cloudflared tunnel --url "http://127.0.0.1:$PUERTO" --no-autoupdate > "$SALIDA" 2>&1 &
disown
echo "[$(date)] lanzando cloudflared -> :$PUERTO" >> "$LOG"

URL=""
for i in $(seq 1 30); do
  sleep 2
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$SALIDA" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
done
if [ -z "$URL" ]; then
  echo "[$(date)] ERROR: cloudflared no dio URL" >> "$LOG"; exit 1
fi

python3 - "$URL" "$ESTADO" <<'PY'
import json, sys, time
url, ruta = sys.argv[1], sys.argv[2]
json.dump({"url": url, "mando": url + "/mando", "local": "http://localhost:9002/mando",
           "puerto": 9002, "t": time.strftime("%Y-%m-%d %H:%M:%S")},
          open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
PY
echo "[$(date)] túnel del Mando -> $URL" >> "$LOG"
echo "$URL"
