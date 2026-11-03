#!/bin/bash
# (1103 · AA) `codegraph sync` solo cuando la Mac respira, y nunca más de CODEGRAPH_TOPE_S segundos (20 min).
# Con la presión de memoria del núcleo en aviso (≥ 2) se salta la pasada: launchd la vuelve a lanzar en 15 min.
# El 03-11 un sync llevaba casi dos horas con 7 GB de swap en una Mac de 8 GB y Genesis no contestaba.
set -u
RAIZ="${1:-/Users/alex/Documents/starseed-os-main}"
TOPE="${CODEGRAPH_TOPE_S:-1200}"
nivel=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
case "$nivel" in ''|*[!0-9]*) nivel=1 ;; esac
if [ "$nivel" -ge 2 ]; then
  echo "$(date '+%F %T') codegraph sync: presión de memoria $nivel en la Mac → me salto esta pasada"
  exit 0
fi
/Users/alex/.local/bin/codegraph sync "$RAIZ" &
hijo=$!
( sleep "$TOPE"; if kill -0 "$hijo" 2>/dev/null; then
    echo "$(date '+%F %T') codegraph sync: pasó de ${TOPE} s → lo corto (vuelve en la próxima pasada)"
    pkill -TERM -P "$hijo" 2>/dev/null; kill -TERM "$hijo" 2>/dev/null
  fi ) &
vigia=$!
wait "$hijo"; rc=$?
kill "$vigia" 2>/dev/null
exit "$rc"
