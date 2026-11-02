#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST_SRC="${REPO_ROOT}/servicios/servidor-ia/launchd/com.starseed.servidor-ia.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/com.starseed.servidor-ia.plist"
LABEL="com.starseed.servidor-ia"

uso() {
  echo "Uso: $0 encender|apagar|estado"
  exit 1
}

[[ $# -eq 1 ]] || uso
CMD="$1"

copiar_plantilla() {
  mkdir -p "${HOME}/Library/LaunchAgents"
  cp "${PLIST_SRC}" "${PLIST_DST}"
  sed -i '' "s|__REPO__|${REPO_ROOT}|g" "${PLIST_DST}"
}

encender() {
  copiar_plantilla
  launchctl bootstrap gui/$(id -u) "${PLIST_DST}" || true
  echo "servidor-ia encendido (launchd)"
}

apagar() {
  launchctl bootout gui/$(id -u) "${LABEL}" 2>/dev/null || true
  rm -f "${PLIST_DST}"
  echo "servidor-ia apagado"
}

estado() {
  if curl -s --max-time 2 http://127.0.0.1:4480/salud >/dev/null; then
    echo "servidor-ia activo en 127.0.0.1:4480"
  else
    echo "servidor-ia no responde"
  fi
}

case "${CMD}" in
  encender) encender ;;
  apagar) apagar ;;
  estado) estado ;;
  *) uso ;;
esac
