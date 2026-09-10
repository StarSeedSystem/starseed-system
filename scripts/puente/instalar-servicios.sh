#!/bin/zsh
# Pone los servicios del Puente bajo launchd, que es quien de verdad los mantiene vivos.
#
#   bash scripts/puente/instalar-servicios.sh          # instala y arranca
#   bash scripts/puente/instalar-servicios.sh estado   # dice quién vive
#   bash scripts/puente/instalar-servicios.sh parar    # descarga todos
#
# POR QUÉ LAUNCHD. Los lanzábamos con un demonio propio (doble fork + setsid) y aun
# así morían todos a la vez, sin marca de salida. La causa: el servidor MCP que da la
# terminal arranca con `--pgroup` y, al reiniciarse, se lleva por delante todo lo que
# lanzó. La prueba está en que el Mando fue el ÚNICO superviviente de cada masacre — y
# era el único bajo launchd. Así que van todos ahí: launchd es de macOS, sobrevive al
# reinicio del MCP, al cierre de la terminal y al arranque de la máquina, y con
# KeepAlive los levanta solo si se caen.
#
# POR QUÉ UN PYTHON ESCRIBE LOS PLIST. Porque hay dos trampas que en zsh se olvidan y
# en un solo sitio no: launchd no usa el PATH para el ejecutable, y el permiso de
# disco de macOS se da por binario (python3 lo tiene, zsh y bash no). Están explicadas
# en instalar-servicios.py y en lanzador-tcc.py.
set -e
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
PY3="/opt/homebrew/bin/python3"
[ -x "$PY3" ] || PY3="$(command -v python3)"
AGENTES="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTES"

case "${1:-instalar}" in
  estado)
    printf "%-26s %s\n" SERVICIO "PID / ULTIMA SALIDA"
    launchctl list | grep com.starseed | awk '{printf "%-26s %s / %s\n", $3, $1, $2}' | sort
    ;;
  parar)
    for p in "$AGENTES"/com.starseed.*.plist; do
      launchctl unload "$p" 2>/dev/null && echo "descargado $(basename "$p" .plist)"
    done
    ;;
  *)
    "$PY3" "$RAIZ/scripts/puente/instalar-servicios.py" "$RAIZ" "$PY3"
    echo
    echo "Comprueba con: bash $0 estado"
    ;;
esac
