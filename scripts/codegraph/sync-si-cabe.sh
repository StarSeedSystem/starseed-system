#!/bin/bash
# (1103 · AA) `codegraph sync` solo cuando la Mac respira, y nunca más de CODEGRAPH_TOPE_S segundos (20 min).
# Con la presión de memoria del núcleo en aviso (≥ 2) se salta la pasada: launchd la vuelve a lanzar en 15 min.
# El 03-11 un sync llevaba casi dos horas con 7 GB de swap en una Mac de 8 GB y Genesis no contestaba.
# SUP0411B: si un sync se corta por tope, escribe la hora en CODEGRAPH_ESTADO;
# la siguiente pasada se salta si fue hace < CODEGRAPH_ESPERA_S s.
# Lanza codegraph con /usr/sbin/taskpolicy -b (QoS de fondo) cuando existe.
# Variables CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION configurables.
set -u
RAIZ="${1:-/Users/alex/Documents/starseed-os-main}"
TOPE="${CODEGRAPH_TOPE_S:-1200}"
ESTADO="${CODEGRAPH_ESTADO:-$HOME/.starseed/codegraph-sync-corte}"
ESPERA="${CODEGRAPH_ESPERA_S:-21600}"
BIN="${CODEGRAPH_BIN:-/Users/alex/.local/bin/codegraph}"

# Leer nivel de presión: CODEGRAPH_NIVEL_PRESION si está seteado, si no sysctl
if [ -n "${CODEGRAPH_NIVEL_PRESION:-}" ]; then
    nivel="$CODEGRAPH_NIVEL_PRESION"
else
    nivel=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
fi
case "$nivel" in ''|*[!0-9]*) nivel=1 ;; esac
if [ "$nivel" -ge 2 ]; then
    echo "$(date '+%F %T') codegraph sync: presión de memoria $nivel en la Mac → me salto esta pasada"
    exit 0
fi

# Verificar si el último corte fue reciente
if [ -f "$ESTADO" ]; then
    ultima_corte=$(cat "$ESTADO" 2>/dev/null || echo 0)
    case "$ultima_corte" in ''|*[!0-9]*) ultima_corte=0 ;; esac
    if [ "$ultima_corte" -ne 0 ]; then
        ahora=$(date '+%s')
        hace=$((ahora - ultima_corte))
        if [ "$hace" -lt "$ESPERA" ]; then
            min=$((hace / 60))
            echo "$(date '+%F %T') codegraph sync: la última pasada se cortó hace $min min → me salto esta"
            exit 0
        fi
    fi
fi

# Preparar comando con taskpolicy -b si existe
if [ -x /usr/sbin/taskpolicy ]; then
    cmd="/usr/sbin/taskpolicy -b $BIN sync \"$RAIZ\""
else
    cmd="$BIN sync \"$RAIZ\""
fi

eval "$cmd" &
hijo=$!
( sleep "$TOPE"; if kill -0 "$hijo" 2>/dev/null; then
    echo "$(date '+%F %T') codegraph sync: pasó de ${TOPE} s → lo corto (vuelve en la próxima pasada)"
    date '+%s' > "$ESTADO"
    pkill -TERM -P "$hijo" 2>/dev/null; kill -TERM "$hijo" 2>/dev/null
  fi ) &
vigia=$!
wait "$hijo"; rc=$?
kill "$vigia" 2>/dev/null

# Si terminó bien (rc=0), escribir 0 en el estado (no borrar el archivo)
if [ "$rc" -eq 0 ]; then
    echo 0 > "$ESTADO"
fi

exit "$rc"