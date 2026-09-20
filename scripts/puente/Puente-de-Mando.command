#!/bin/zsh
# ════════════════════════════════════════════════════════════════════════
# StarSeed OS · Puente de Mando — lanzador de doble clic (2026-09-20)
# Abre http://localhost:9002/mando y, si hace falta, lo levanta antes:
#   1) revive por launchd lo que esté caído (backend Astraura 1.58, gobernador,
#      vigilante del enjambre, director);
#   2) si no hay build de producción (.next/BUILD_ID), compila el OS con el
#      turno de la máquina (no se pelea por la RAM con los agentes);
#   3) arranca el servidor ligero (next start :9002) por launchd;
#   4) abre el navegador en el Mando.
# Fuente de verdad: scripts/puente/Puente-de-Mando.command (la copia del
# Escritorio es la misma; `bash scripts/puente/instalar-servicios.sh` la refresca).
# Sustituye a Orquestacion-StarSeed.command (Adenda 185, visor en :8899, retirado).
# ════════════════════════════════════════════════════════════════════════
export PATH="$HOME/.local/bin:$HOME/.opencode/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
RAIZ="${STARSEED_ROOT:-$HOME/Documents/starseed-os-main}"
PUERTO="${STARSEED_MANDO_PUERTO:-9002}"
URL="http://localhost:$PUERTO/mando"
UID_="$(id -u)"

vivo() { curl -s -o /dev/null -m 3 "$URL"; }
responde() { curl -s -o /dev/null -w '%{http_code}' -m 3 "$1" 2>/dev/null; }
reviviendo() {  # etiqueta launchd, url de salud (opcional)
  local etiqueta="$1" salud="$2"
  if [ -n "$salud" ] && [ "$(responde "$salud")" = "200" ]; then return 0; fi
  if launchctl print "gui/$UID_/$etiqueta" >/dev/null 2>&1; then
    launchctl kickstart "gui/$UID_/$etiqueta" >/dev/null 2>&1 && echo "  · $etiqueta revivido"
  fi
}

echo "◈ StarSeed OS · Puente de Mando"
cd "$RAIZ" || { echo "  ⚠ No encuentro el repositorio en $RAIZ"; sleep 5; exit 1; }

# 1) Servicios que el Mando enseña (no se tocan si ya viven)
reviviendo com.starseed.astraura "http://127.0.0.1:8000/api/status"
reviviendo com.starseed.gobernador ""
reviviendo com.starseed.vigilante ""
reviviendo com.starseed.director ""

# 2) Build de producción, con el turno de la máquina
if ! vivo && [ ! -f "$RAIZ/.next/BUILD_ID" ]; then
  echo "  · No hay build de producción: compilando el OS (5–15 min; hace cola si el enjambre está en tsc/vitest)…"
  if ! python3 "$RAIZ/scripts/puente/con-turno.py" -- bash "$RAIZ/scripts/starseed-ligero.sh" construir; then
    echo "  ⚠ El build falló. Mira /tmp/starseed-ligero-build.log"; sleep 8; exit 1
  fi
fi

# 3) Servidor ligero por launchd (arrancar-mando.sh: doble fork, sobrevive a la terminal)
if ! vivo; then
  echo "  · Arrancando el Mando en :$PUERTO…"
  if launchctl print "gui/$UID_/com.starseed.mando" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$UID_/com.starseed.mando" >/dev/null 2>&1
  else
    bash "$RAIZ/scripts/puente/arrancar-mando.sh" >/dev/null 2>&1
  fi
  for i in {1..60}; do sleep 1; vivo && break; done
fi

# 4) Abrir
if vivo; then
  echo "  · Abriendo $URL"
  open "$URL"
else
  echo "  ⚠ El Mando no responde en $URL. Mira /tmp/starseed-mando.log"
  sleep 8; exit 1
fi
sleep 1
