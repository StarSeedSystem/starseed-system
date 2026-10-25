#!/usr/bin/env bash
# instalar.sh — instala la unidad systemd de USUARIO del servidor propio de IA
# (RIA1023B, A1 y Linux). Idempotente. Ver architecture/recursos-ia-neurona.md §6.
#
# Ningún secreto aquí ni en el repo: host, puerto y token viven en
# ~/.starseed/servidor-ia.env (fuera del repo); si no existe, se crea con solo los
# NOMBRES de las variables, comentados.
#
# Uso:
#   bash instalar.sh             # copia la unidad a ~/.config/systemd/user/ y recarga
#   bash instalar.sh --encender  # además hace systemctl --user enable --now
set -euo pipefail

ENCENDER=no
for arg in "$@"; do
    case "$arg" in
        --encender) ENCENDER=yes ;;
        *) echo "instalar.sh: argumento no reconocido: $arg (solo se admite --encender)" >&2; exit 2 ;;
    esac
done

SERVICIO="starseed-servidor-ia.service"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ORIGEN="$RAIZ/servicios/servidor-ia/systemd/$SERVICIO"
ENTRADA="$RAIZ/servicios/servidor-ia/bin/servidor-ia.mjs"
UNID="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$SERVICIO"
ENVF="$HOME/.starseed/servidor-ia.env"

paso() { echo "[instalar-servidor-ia] $*"; }

if [ ! -f "$ORIGEN" ]; then
    echo "instalar.sh: no encuentro la unidad $ORIGEN." >&2
    exit 3
fi
command -v node >/dev/null 2>&1 || { echo "instalar.sh: falta node." >&2; exit 3; }
node -e 'const p=process.versions.node.split(".").map(Number); if ((p[0] ?? 0) < 22) process.exit(1)' \
    || { echo "instalar.sh: node demasiado viejo: $(node --version) (hace falta >= 22)" >&2; exit 3; }
command -v systemctl >/dev/null 2>&1 || { echo "instalar.sh: falta systemd (la unidad es de usuario)." >&2; exit 3; }
if [ ! -f "$ENTRADA" ]; then
    echo "instalar.sh: no encuentro el servidor en $ENTRADA." >&2
    echo "instalar.sh: se espera el repositorio en ~/starseed-system (o ajusta ExecStart)." >&2
    exit 3
fi

mkdir -p "${UNID%/*}"
if [ "$RAIZ" = "$HOME/starseed-system" ]; then
    cp "$ORIGEN" "$UNID"
else
    # El repo vive en otra ruta: se reescribe el prefijo %h/starseed-system al copiar.
    paso "el repositorio está en $RAIZ; se reescribe la ruta del ExecStart"
    sed "s|%h/starseed-system/servicios/servidor-ia|$RAIZ/servicios/servidor-ia|g" "$ORIGEN" > "$UNID"
fi
[ -x "$ENTRADA" ] || chmod +x "$ENTRADA"

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

if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "$UNID" || paso "aviso: systemd-analyze reportó dudas (continúa)"
fi

paso "systemctl --user daemon-reload"
systemctl --user daemon-reload

if [ "$ENCENDER" = "yes" ]; then
    paso "enable --now"
    systemctl --user enable --now "$SERVICIO"
    paso "encendida: systemctl --user status $SERVICIO"
else
    paso "unidad copiada en $UNID (sin encender)"
    paso "para habilitarla y arrancarla: bash $0 --encender"
fi
