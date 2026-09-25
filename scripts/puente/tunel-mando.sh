#!/bin/bash
# ═══ StarSeed · Túnel del Puente de Mando ═══════════════════════════════════
# Pedido por Alex (2026-09-17): «que el chat de Hermes envíe un mensaje con el
# enlace para abrir y vincular el Puente de Mando desde cualquier navegador».
#
# Un túnel rápido de cloudflared hacia el puerto 9002. La URL es aleatoria y
# cambia si el túnel se rehace; por eso se guarda en ~/.starseed/tunel-mando.json
# (chmod 600) y se manda al chat privado de Alex cuando cambia
# (avisar-enlace-mando.py) — nunca se escribe en el repo, en los docs ni en logs.
#
# CUIDADO: el Mando puede aprobar, rechazar y soltar tareas. Cualquiera con la
# URL llega a él. Es imposible de adivinar, pero NO es una contraseña: si se
# filtra, se reinicia este servicio y sale otra.
#
# (2026-09-25) POR QUÉ «NO ABRÍA»: el guion salía en cuanto tenía la URL. launchd
# (KeepAlive) mata el grupo de procesos del trabajo al salir, así que se llevaba
# por delante al cloudflared recién lanzado; a los 30 s lo relanzaba, pedía OTRO
# túnel, y tras ~10 vueltas Cloudflare cortaba por IP (error 1015) y el guion
# dormía 20 min dejando una URL muerta en tunel-mando.json. Ahora el guion se
# queda en primer plano vigilando SU cloudflared: mientras vive, la URL no cambia.
set -u
PUERTO=9002
ESTADO="$HOME/.starseed/tunel-mando.json"
LOG="$HOME/.starseed/tunel-mando.log"
SALIDA="/tmp/mando_cloudflared.log"
AQUI="$(cd "$(dirname "$0")" && pwd)"
VIGILA_S=60          # cada cuánto se comprueba que el túnel contesta
FALLOS_MAX=5         # fallos seguidos (con el Mando local vivo) antes de rehacerlo
mkdir -p "$HOME/.starseed"

ANTERIOR=$(python3 -c "import json;print(json.load(open('$ESTADO')).get('url',''))" 2>/dev/null)

pkill -f "cloudflared tunnel --url http://127.0.0.1:$PUERTO" 2>/dev/null
sleep 1
: > "$SALIDA"
cloudflared tunnel --url "http://127.0.0.1:$PUERTO" --no-autoupdate > "$SALIDA" 2>&1 &
CF=$!
trap 'kill $CF 2>/dev/null' EXIT TERM INT
echo "[$(date)] lanzando cloudflared (pid $CF) -> :$PUERTO" >> "$LOG"

URL=""
for i in $(seq 1 30); do
  sleep 2
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$SALIDA" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  kill -0 "$CF" 2>/dev/null || break
done
if [ -z "$URL" ]; then
  # Cloudflare contesta «429 · error 1015» si se piden túneles rápidos seguidos:
  # sin URL se espera 20 min antes de salir para no pedir otro enseguida.
  motivo=$(grep -oE "429 Too Many Requests|error code: 1015|[A-Za-z ]*lookup[^\"]*" "$SALIDA" 2>/dev/null | head -1)
  echo "[$(date)] ERROR: cloudflared no dio URL (${motivo:-sin motivo}); espero 20 min" >> "$LOG"
  kill "$CF" 2>/dev/null
  sleep 1200; exit 1
fi

python3 - "$URL" "$ESTADO" <<'PY'
import json, os, sys, time
url, ruta = sys.argv[1], sys.argv[2]
with open(ruta, "w", encoding="utf-8") as f:
    json.dump({"url": url, "mando": url + "/mando", "local": "http://localhost:9002/mando",
               "puerto": 9002, "t": time.strftime("%Y-%m-%d %H:%M:%S")}, f, ensure_ascii=False, indent=1)
os.chmod(ruta, 0o600)
PY
echo "[$(date)] túnel del Mando listo (la URL solo está en tunel-mando.json)" >> "$LOG"

# Si la URL cambió, el enlace nuevo va al chat privado de Alex (espera a que el
# túnel conteste para no mandar un enlace que todavía no abre).
if [ "$URL" != "$ANTERIOR" ]; then
  for i in $(seq 1 10); do
    curl -s -m 15 -o /dev/null -w '%{http_code}' "$URL/mando" 2>/dev/null | grep -qE '^(200|307|308)$' && break
    sleep 6
  done
  python3 "$AQUI/avisar-enlace-mando.py" >/dev/null 2>&1 || echo "[$(date)] no pude avisar del enlace nuevo" >> "$LOG"
fi

# Primer plano: mientras cloudflared viva y el túnel conteste, no se hace nada.
# Si cloudflared muere, o el túnel no contesta FALLOS_MAX veces seguidas con el
# Mando local vivo, se sale y launchd lo rehace (ThrottleInterval 30 s).
fallos=0
while kill -0 "$CF" 2>/dev/null; do
  sleep "$VIGILA_S"
  codigo=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL/mando" 2>/dev/null)
  if echo "$codigo" | grep -qE '^(200|307|308)$'; then
    fallos=0
    continue
  fi
  local_ok=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO/mando" 2>/dev/null)
  if echo "$local_ok" | grep -qE '^(200|307|308)$'; then
    fallos=$((fallos + 1))
    echo "[$(date)] el túnel no contesta ($codigo) · fallo $fallos de $FALLOS_MAX" >> "$LOG"
    [ "$fallos" -ge "$FALLOS_MAX" ] && break
  fi
done
echo "[$(date)] cloudflared terminó o el túnel dejó de contestar: salgo y launchd lo rehace" >> "$LOG"
exit 1
