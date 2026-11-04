#!/bin/bash
# (1103 · AA) `codegraph sync` solo cuando la Mac respira, y nunca más de CODEGRAPH_TOPE_S segundos (20 min).
# Con la presión de memoria del núcleo en aviso (≥ 2) se salta la pasada: launchd la vuelve a lanzar en 15 min.
# El 03-11 un sync llevaba casi dos horas con 7 GB de swap en una Mac de 8 GB y Genesis no contestaba.
# SUP0411B: si un sync se corta por tope, se guarda la hora; si fue hace < CODEGRAPH_ESPERA_S (6 h por defecto),
# la siguiente pasada se salta. Un sync que acaba bien escribe 0 en el estado. codegraph se lanza con taskpolicy -b
# (QoS de fondo) cuando existe. CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION para pruebas.
set -u
RAIZ="${1:-/Users/alex/Documents/starseed-os-main}"
TOPE="${CODEGRAPH_TOPE_S:-1200}"
BIN="${CODEGRAPH_BIN:-/Users/alex/.local/bin/codegraph}"
ESTADO="${CODEGRAPH_ESTADO:-$HOME/.starseed/codegraph-sync-corte}"
ESPERA="${CODEGRAPH_ESPERA_S:-21600}"
NIVEL_PRESION="${CODEGRAPH_NIVEL_PRESION:-}"
if [ -z "$NIVEL_PRESION" ]; then
  NIVEL_PRESION=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
fi
case "$NIVEL_PRESION" in ''|*[!0-9]*) NIVEL_PRESION=1 ;; esac

mkdir -p "$(dirname "$ESTADO")"

if [ "$NIVEL_PRESION" -ge 2 ]; then
  echo "$(date '+%F %T') codegraph sync: presión de memoria $NIVEL_PRESION en la Mac → me salto esta pasada"
  exit 0
fi

ahora=$(date +%s)
if [ -f "$ESTADO" ]; then
  ultimo=$(cat "$ESTADO" 2>/dev/null || echo 0)
  if [ "$ultimo" -gt 0 ]; then
    hace=$((ahora - ultimo))
    if [ "$hace" -lt "$ESPERA" ]; then
      min=$((hace / 60))
      echo "$(date '+%F %T') codegraph sync: la última pasada se cortó hace $min min → me salto esta"
      exit 0
    fi
  fi
fi

if command -v taskpolicy >/dev/null 2>&1; then
  taskpolicy -b "$BIN" sync "$RAIZ" &
else
  "$BIN" sync "$RAIZ" &
fi
hijo=$!

( sleep "$TOPE"; if kill -0 "$hijo" 2>/dev/null; then
    echo "$(date '+%F %T') codegraph sync: pasó de ${TOPE} s → lo corto (vuelve en la próxima pasada)"
    echo "$(date +%s)" > "$ESTADO"
    pkill -TERM -P "$hijo" 2>/dev/null
    kill -TERM "$hijo" 2>/dev/null
  fi ) &
vigia=$!

wait "$hijo"; rc=$?
kill "$vigia" 2>/dev/null
if [ "$rc" -eq 0 ]; then
  echo 0 > "$ESTADO"
fi
exit "$rc"