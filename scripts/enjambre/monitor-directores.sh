#!/bin/bash
# ── StarSeed Monitor de Directores ───────────────────────────────────────────
# Verifica que el ejecutor esté vivo y reinició si es necesario.
# Se ejecuta como cron job cada 5 minutos.

set -e
export PATH="$HOME/.local/bin:$PATH"
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ"

LOG="starseed_memory_root/logs/monitor-directores.log"
COLA="starseed_memory_root/olas/cola-reactivar-pendientes.json"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"; }

# 1. Verificar si hay tareas pendientes
PENDIENTES=$(python3 -c "
import json
with open('$COLA') as f:
    cola = json.load(f)
pend = [t for t in cola if t.get('estado') == 'pendiente']
print(len(pend))
" 2>/dev/null || echo "0")

log "📋 Tareas pendientes: $PENDIENTES"

if [ "$PENDIENTES" -eq 0 ]; then
    log "✅ No hay tareas pendientes"
    exit 0
fi

# 2. Verificar si el ejecutor está vivo
EJECUTOR_VIVO=$(pgrep -f "ejecutor-simple.py" | wc -l | tr -d ' ')

if [ "$EJECUTOR_VIVO" -gt 0 ]; then
    log "✅ Ejecutor vivo ($EJECUTOR_VIVO procesos)"
    # Verificar que esté avanzando (bytes creciendo)
    sleep 5
    exit 0
fi

# 3. Si no está vivo, iniciarlo
log "⚠️  Ejecutor no vivo. Iniciando..."

# Verificar Ollama
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    log "❌ Ollama no responde. No se puede iniciar ejecutor."
    exit 1
fi

# Iniciar ejecutor en background
nohup python3 scripts/enjambre/ejecutor-simple.py > /tmp/ejecutor-simple.log 2>&1 &
PID=$!
log "🚀 Ejecutor iniciado (PID $PID)"

sleep 2

if pgrep -f "ejecutor-simple.py" > /dev/null; then
    log "✅ Ejecutor corriendo"
else
    log "❌ Falló el inicio del ejecutor"
    exit 1
fi
