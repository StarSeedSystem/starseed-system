#!/usr/bin/env bash
# notebooklm-headless.sh — el extra `[headless]` del CLI de NotebookLM (SES1113D).
#
# Instala notebooklm-py[headless]==VERSION en el venv propio de este nodo,
# con la MISMA versión fijada en el A1 (/home/starseed/.starseed/venvs/notebooklm)
# y en la Mac (~/.starseed/venvs/notebooklm). Idempotente: si ya está en esa
# versión solo asegura el extra `headless` (gpsoauth) sin mover la versión.
# No imprime claves; no toca perfiles ni sesiones. Uso:
#   bash notebooklm-headless.sh [--venv /ruta/del/venv]
set -euo pipefail

VERSION="0.8.6"
PAQUETE="notebooklm-py[headless]==${VERSION}"
VENV="${NOTEBOOKLM_VENV:-}"

uso() {
  echo "Uso: bash notebooklm-headless.sh [--venv /ruta/del/venv]" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --venv)
      [ "$#" -ge 2 ] || { uso; exit 2; }
      VENV="$2"
      shift 2
      ;;
    -h|--help)
      uso
      exit 0
      ;;
    *)
      echo "Opción desconocida: $1" >&2
      uso
      exit 2
      ;;
  esac
done

if [ -z "$VENV" ]; then
  if [ -d /home/starseed ]; then
    VENV="/home/starseed/.starseed/venvs/notebooklm"
  else
    VENV="${HOME}/.starseed/venvs/notebooklm"
  fi
fi

# En el A1 el dueño del venv es el usuario de servicio: nunca se instala como root.
if [ "$(id -u)" -eq 0 ] && id starseed >/dev/null 2>&1 \
   && [ "${VENV#/home/starseed/}" != "$VENV" ]; then
  exec sudo -u starseed env HOME=/home/starseed "$0" --venv "$VENV"
fi

mkdir -p "$(dirname "$VENV")"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
PY="$VENV/bin/python"

version_instalada() {
  "$PY" - <<'PYFIN' 2>/dev/null || true
from importlib.metadata import version
print(version("notebooklm-py"))
PYFIN
}

ANTES="$(version_instalada)"

# Siempre la versión fijada: si ya coincide, pip solo completa el extra `headless`.
"$PY" -m pip install --quiet --disable-pip-version-check "$PAQUETE"

DESPUES="$(version_instalada)"
if [ "$DESPUES" != "$VERSION" ]; then
  echo "notebooklm-headless: se esperaba $VERSION y quedó ${DESPUES:-sin instalar} en $VENV (antes: ${ANTES:-ninguna})" >&2
  exit 1
fi

if [ -x "$VENV/bin/notebooklm" ]; then
  echo "notebooklm-headless $VERSION listo en $VENV"
else
  echo "notebooklm-headless: falta el ejecutable $VENV/bin/notebooklm" >&2
  exit 1
fi
