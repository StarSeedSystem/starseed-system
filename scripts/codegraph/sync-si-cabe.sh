#!/bin/bash
# (1103 · AA) `codegraph sync` solo cuando la Mac respira, y nunca más de CODEGRAPH_TOPE_S segundos (20 min).
# Con la presión de memoria del núcleo en aviso (≥ 2) se salta la pasada: launchd la vuelve a lanzar en 15 min.
# El 03-11 un sync llevaba casi dos horas con 7 GB de swap en una Mac de 8 GB y Genesis no contestaba.
# SUP0411B: si un sync se corta por tope, guarda la hora y espera CODEGRAPH_ESPERA_S (6 h por defecto)
# antes de volver a intentarlo; lanza codegraph con taskpolicy -b (QoS fondo) cuando existe.
set -u
RAIZ="${1:-/Users/alex/Documents/starseed-os-main}"
TOPE="${CODEGRAPH_TOPE_S:-1200}"
ESPERA="${CODEGRAPH_ESPERA_S:-21600}"
BIN="${CODEGRAPH_BIN:-/Users/alex/.local/bin/codegraph}"
ESTADO="${CODEGRAPH_ESTADO:-$HOME/.starseed/codegraph-sync-corte}"
NIVEL_PRESION="${CODEGRAPH_NIVEL_PRESION:-$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)}"
case "$NIVEL_PRESION" in ''|*[!0-9]*) NIVEL_PRESION=1 ;; esac

if [ "$NIVEL_PRESION" -ge 2 ]; then
  echo "$(date '+%F %T') codegraph sync: presión de memoria $NIVEL_PRESION en la Mac → me salto esta pasada"
  exit 0
fi

inicio=$(date +%s)
if [ -f "$ESTADO" ]; then
  ultimo=$(cat "$ESTADO" 2>/dev/null || echo 0)
  case "$ultimo" in ''|*[!0-9]*) ultimo=0 ;; esac
  if [ "$ultimo" -gt 0 ]; then
    diff=$((inicio - ultimo))
    if [ "$diff" -lt "$ESPERA" ]; then
      min=$((diff / 60))
      echo "$(date '+%F %T') codegraph sync: la última pasada se cortó hace $min min → me salgo esta"
      exit 0
    fi
  fi
fi

cmd=("$BIN" "sync" "$RAIZ")
if command -v /usr/sbin/taskpolicy >/dev/null 2>&1; then
  cmd=(/usr/sbin/taskpolicy -b "${cmd[@]}")
fi

"${cmd[@]}" &
hijo=$!
( sleep "$TOPE"; if kill -0 "$hijo" 2>/dev/null; then
    echo "$(date '+%F %T') codegraph sync: pasó de ${TOPE} s → lo corto (vuelve en la próxima pasada)"
    echo "$(date +%s)" > "$ESTADO"
    pkill -TERM -P "$hijo" 2>/dev/null; kill -TERM "$hijo" 2>/dev/null
  fi ) &
vigia=$!
wait "$hijo"; rc=$?
kill "$vigia" 2>/dev/null

# Si el vigilante escribió un timestamp durante esta ejecución (timeout), no sobrescribir con 0 y salir con error
if [ -f "$ESTADO" ]; then
  corte=$(cat "$ESTADO" 2>/dev/null || echo 0)
  case "$corte" in ''|*[!0-9]*) corte=0 ;; esac
  if [ "$corte" -ge "$inicio" ]; then
    exit 1
  fi
fi

if [ "$rc" -eq 0 ]; then
  echo 0 > "$ESTADO"
fi
exit "$rc"