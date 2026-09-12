#!/bin/bash
# ── Lanzador del AutoRouter StarSeed ──────────────────────────────────────────
# Inicia el proxy local de enrutamiento de APIs como servicio persistente.
# Uso: bash scripts/enjambre/lanzar-autorouter.sh

set -e

export PATH="$HOME/.local/bin:$PATH"
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ"

# Cargar variables de entorno (solo líneas válidas, ignorar paths con espacios)
carga_env() {
    local f="$1"
    [ -f "$f" ] || return
    while IFS='=' read -r key value; do
        case "$key" in
            *[a-zA-Z0-9_]*)
                export "$key=$value"
                ;;
        esac
    done < <(grep -E '^[A-Z_]+=' "$f" 2>/dev/null | head -100)
}

carga_env ~/.hermes/.env
carga_env ~/.starseed/env

PUERTO="${AUTOROUTER_PORT:-9800}"
PIDFILE="/tmp/starseed-autorouter.pid"

# Si ya está vivo, no arrancar de nuevo
if [ -f "$PIDFILE" ]; then
    PID_OLD=$(cat "$PIDFILE" 2>/dev/null)
    if kill -0 "$PID_OLD" 2>/dev/null; then
        echo "AutoRouter ya vivo (PID $PID_OLD)"
        exit 0
    fi
    rm -f "$PIDFILE"
fi

echo "Iniciando AutoRouter en puerto $PUERTO..."
nohup python3 scripts/enjambre/starseed-autorouter.py > /tmp/starseed-autorouter.log 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"
sleep 2

if kill -0 "$PID" 2>/dev/null; then
    echo "AutoRouter OK (PID $PID)"
    echo "Health: http://127.0.0.1:$PUERTO/health"
else
    echo "FALLÓ el inicio. Log:"
    tail -10 /tmp/starseed-autorouter.log
    exit 1
fi
