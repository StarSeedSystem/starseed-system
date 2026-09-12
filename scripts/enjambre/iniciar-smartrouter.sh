#!/bin/bash
# ── StarSeed SmartRouter Service ──────────────────────────────────────────────
# Inicia el SmartRouter como servicio persistente con auto-reinicio.
# Uso: bash scripts/enjambre/iniciar-smartrouter.sh

set -e

export PATH="$HOME/.local/bin:$PATH"
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ"

# Cargar variables
for f in ~/.hermes/.env ~/.starseed/env; do
    [ -f "$f" ] && export $(grep -E '^[A-Z_]+=' "$f" 2>/dev/null | head -50)
done

PUERTO="${SMARTROUTER_PORT:-9800}"
PIDFILE="/tmp/smartrouter.pid"
LOG="/tmp/smartrouter.log"

# Matar proceso anterior
if [ -f "$PIDFILE" ]; then
    PID_OLD=$(cat "$PIDFILE" 2>/dev/null)
    kill -9 "$PID_OLD" 2>/dev/null || true
    rm -f "$PIDFILE"
fi

# Liberar puerto
lsof -ti:$PUERTO 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 2

echo "Iniciando SmartRouter en puerto $PUERTO..."
nohup python3 scripts/enjambre/smartrouter.py > "$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"
sleep 3

if kill -0 "$PID" 2>/dev/null; then
    echo "✅ SmartRouter OK (PID $PID)"
    echo "Health: http://127.0.0.1:$PUERTO/health"
else
    echo "❌ FALLÓ. Log:"
    tail -10 "$LOG"
    exit 1
fi
