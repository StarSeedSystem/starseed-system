#!/bin/bash
# (1103 · AA) `codegraph sync` solo cuando la Mac respira, y nunca más de CODEGRAPH_TOPE_S segundos (20 min).
# Con la presión de memoria del núcleo en aviso (≥ 2) se salta la pasada: launchd la vuelve a lanzar en 15 min.
# El 03-11 un sync llevaba casi dos horas con 7 GB de swap en una Mac de 8 GB y Genesis no contestaba.
# SUP0411B: si un sync se corta por tope, espera CODEGRAPH_ESPERA_S (def. 6 h) antes de reintentar;
# lanza con taskpolicy -b (QoS fondo) cuando existe; variables CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION.
set -u
RAIZ="${1:-/Users/alex/Documents/starseed-os-main}"
TOPE="${CODEGRAPH_TOPE_S:-1200}"
ESPERA="${CODEGRAPH_ESPERA_S:-21600}"
ESTADO="${CODEGRAPH_ESTADO:-$HOME/.starseed/codegraph-sync-corte}"
BIN="${CODEGRAPH_BIN:-/Users/alex/.local/bin/codegraph}"
NIVEL_PRESION="${CODEGRAPH_NIVEL_PRESION:-$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)}"
case "$NIVEL_PRESION" in ''|*[!0-9]*) NIVEL_PRESION=1 ;; esac

mkdir -p "$(dirname "$ESTADO")"

if [ "$NIVEL_PRESION" -ge 2 ]; then
  echo "$(date '+%F %T') codegraph sync: presión de memoria $NIVEL_PRESION en la Mac → me salto esta pasada"
  exit 0
fi

if [ -f "$ESTADO" ]; then
  ultimo_corte=$(cat "$ESTADO" 2>/dev/null || echo 0)
  case "$ultimo_corte" in ''|*[!0-9]*) ultimo_corte=0 ;; esac
  if [ "$ultimo_corte" -gt 0 ]; then
    ahora=$(date +%s)
    diff=$((ahora - ultimo_corte))
    if [ "$diff" -lt "$ESPERA" ]; then
      min=$((diff / 60))
      echo "$(date '+%F %T') codegraph sync: la última pasada se cortó hace $min min → me salto esta"
      exit 0
    fi
  fi
fi

cmd=("$BIN" sync "$RAIZ")
if command -v /usr/sbin/taskpolicy >/dev/null 2>&1; then
  cmd=(/usr/sbin/taskpolicy -b "${cmd[@]}")
fi

"${cmd[@]}" &
hijo=$!

( sleep "$TOPE"; if kill -0 "$hijo" 2>/dev/null; then
    echo "$(date '+%F %T') codegraph sync: pasó de ${TOPE} s → lo corto (vuelve en la próxima pasada)"
    echo "$(date +%s)" > "$ESTADO"
    pkill -TERM -P "$hijo" 2>/dev/null; kill -TERM "$hijo" 2>/dev/null
  fi ) >/dev/null 2>&1 &
vigia=$!

wait "$hijo"; rc=$?
kill "$vigia" 2>/dev/null

if [ "$rc" -eq 0 ]; then
  echo 0 > "$ESTADO"
fi
exit "$rc"