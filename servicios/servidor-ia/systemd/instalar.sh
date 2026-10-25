#!/usr/bin/env bash
# Instalador de la unidad systemd de usuario del servidor propio de IA (A1 y Linux).
# Ver architecture/recursos-ia-neurona.md §6.
#
# Uso:
#   ./instalar.sh             copia la unidad a ~/.config/systemd/user/ y hace daemon-reload
#   ./instalar.sh --encender  además habilita y arranca el servicio (enable --now)
set -euo pipefail

ENCENDER=no
for arg in "$@"; do
    case "$arg" in
        --encender) ENCENDER=yes ;;
        *) echo "instalar.sh: argumento no reconocido: $arg (solo se admite --encender)" >&2; exit 2 ;;
    esac
done

SERVICIO="starseed-servidor-ia.service"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
UNIDAD="$RAIZ/systemd/$SERVICIO"
DESTINO="$HOME/.config/systemd/user/$SERVICIO"
ENTRADA="$HOME/starseed-system/servicios/servidor-ia/bin/servidor-ia.mjs"

if [[ ! -f "$UNIDAD" ]]; then
    echo "instalar.sh: no encuentro la unidad $UNIDAD." >&2
    exit 1
fi
if grep -q "ExecStart=.*servicios/servidor-ia/bin/servidor-ia.mjs" "$UNIDAD" && [[ ! -f "$ENTRADA" ]]; then
    echo "instalar.sh: la unidad apunta a $ENTRADA y no existe ahí el servidor." >&2
    echo "            Clona o copia el repositorio en ~/starseed-system (o ajusta ExecStart)." >&2
    exit 1
fi

mkdir -p "$(dirname "$DESTINO")"
cp "$UNIDAD" "$DESTINO"
systemctl --user daemon-reload

if [[ "$ENCENDER" == "yes" ]]; then
    systemctl --user enable --now "$SERVICIO"
    echo "instalar.sh: $SERVICIO habilitado y encendido. Estado:"
    systemctl --user --no-pager status "$SERVICIO" || true
else
    echo "instalar.sh: $SERVICIO copiado. Para arrancarlo: systemctl --user enable --now $SERVICIO"
fi
echo "instalar.sh: host, puerto y token van en ~/.starseed/servidor-ia.env (sin token solo escucha en 127.0.0.1)."
