#!/usr/bin/env bash
# instalar.sh — instala la unidad systemd de USUARIO del servidor propio de IA (RIA1023B).
# Idempotente. Nada de secretos aquí: los VALORES viven en ~/.starseed/servidor-ia.env,
# fuera del repo; si no existe, se crea con solo los NOMBRES comentados.
#
# Uso:
#   bash instalar.sh             # solo copia la unidad a ~/.config/systemd/user/ y recarga
#   bash instalar.sh --encender  # además hace systemctl --user enable --now
set -euo pipefail

ENCENDER=0
[ "${1:-}" = "--encender" ] && ENCENDER=1

RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
RMJS="$RAIZ/servicios/servidor-ia/bin/servidor-ia.mjs"
ORIGEN="$RAIZ/servicios/servidor-ia/systemd/starseed-servidor-ia.service"
UNID="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/starseed-servidor-ia.service"
ENVF="$HOME/.starseed/servidor-ia.env"

paso() { echo "[instalar-servidor-ia] $*"; }

[ -f "$RMJS" ] || { echo "falta $RMJS (corre instalar.sh desde el repo, que se espera en ~/starseed-system)"; exit 3; }
[ -f "$ORIGEN" ] || { echo "falta $ORIGEN"; exit 3; }
command -v node >/dev/null || { echo "falta node (>= 22)"; exit 3; }
node -e 'const p=process.versions.node.split(".").map(Number); if (p[0]<22) process.exit(1)' \
  || { echo "node demasiado viejo: $(node --version) (hace falta >= 22)"; exit 3; }
command -v systemctl >/dev/null || { echo "falta systemd (esta unidad es de usuario)"; exit 3; }
mkdir -p "${UNID%/*}"

paso "unidad ($RAIZ)"
if [ "$RAIZ" = "$HOME/starseed-system" ]; then
  cp "$ORIGEN" "$UNID"
else
  # El repo vive en otra ruta: se reescribe %h/starseed-system por la real al copiar la unidad.
  sed "s|%h/starseed-system/servicios/servidor-ia|$RAIZ/servicios/servidor-ia|g" "$ORIGEN" > "$UNID"
fi
[ -x "$RMJS" ] || chmod +x "$RMJS"

paso "entorno"
if [ ! -f "$ENVF" ]; then
  mkdir -p "$(dirname "$ENVF")"
  cat > "$ENVF" <<'EOF'
# Variables del servidor propio de IA (solo nombres; sin TOKEN escucha en 127.0.0.1).
# STARSEED_SERVIDOR_IA_HOST=127.0.0.1
# STARSEED_SERVIDOR_IA_PUERTO=4480
# STARSEED_SERVIDOR_IA_TOKEN=
# STARSEED_SERVIDOR_IA_ORIGENES=
EOF
  chmod 600 "$ENVF"
fi

if command -v systemd-analyze >/dev/null; then
  systemd-analyze verify "$UNID" || paso "aviso: systemd-analyze reportó dudas (continúa)"
fi

paso "systemctl --user daemon-reload"
systemctl --user daemon-reload

if [ "$ENCENDER" = 1 ]; then
  paso "enable --now"
  systemctl --user enable --now starseed-servidor-ia.service
  paso "encendida: systemctl --user status starseed-servidor-ia"
else
  paso "unidad copiada en $UNID (sin encender)"
  paso "para habilitarla y arrancarla: bash $0 --encender"
fi
