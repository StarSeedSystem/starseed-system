#!/bin/bash
# ── StarSeed Ejecutor Simple con Ollama ──────────────────────────────────────
# Ejecuta tareas pendientes usando Ollama local.

RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ"

COLA="starseed_memory_root/olas/cola-reactivar-pendientes.json"
WT_BASE="$HOME/Documents/starseed-wt"
LOG="starseed_memory_root/logs/ejecutor-simple.log"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"; }

# 1. Verificar Ollama
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    log "❌ Ollama no responde"
    exit 1
fi
MODELO=$(curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; m=json.load(sys.stdin).get('models',[]); print(m[0]['name'] if m else '')")
log "✅ Ollama vivo: $MODELO"

# 2. Loop de procesamiento
while true; do
    # Leer primera tarea pendiente
    TAREA_JSON=$(python3 -c "
import json
with open('$COLA') as f:
    cola = json.load(f)
for t in cola:
    if t.get('estado') == 'pendiente':
        print(json.dumps(t, ensure_ascii=False))
        break
" 2>/dev/null)

    if [ -z "$TAREA_JSON" ]; then
        log "✅ No hay más tareas pendientes"
        break
    fi

    # Extraer datos usando python
    read TID TITULO PROMPT ARCHIVOS <<< $(echo "$TAREA_JSON" | python3 -c "
import sys,json
t=json.load(sys.stdin)
print(t['id'], t.get('titulo',''), t.get('prompt',''), t.get('archivos',[''])[0])
")
    
    RAMA="ola/$TID"
    WT_PATH="$WT_BASE/$TID"

    log "📋 $TID: $TITULO"

    # Crear worktree si no existe
    if [ ! -d "$WT_PATH" ]; then
        log "📁 Creando worktree..."
        git branch "$RAMA" 2>/dev/null || true
        git worktree add "$WT_PATH" "$RAMA" 2>&1 | tee -a "$LOG" || true
    fi

    if [ ! -d "$WT_PATH" ]; then
        log "❌ No se pudo crear worktree"
        python3 -c "
import json
with open('$COLA') as f:
    cola = json.load(f)
for t in cola:
    if t.get('id') == '$TID':
        t['estado'] = 'fallo'
with open('$COLA', 'w') as f:
    json.dump(cola, f, ensure_ascii=False, indent=1)
"
        continue
    fi

    ARCHIVO_PATH="$WT_PATH/$ARCHIVOS"
    if [ ! -f "$ARCHIVO_PATH" ]; then
        log "❌ Archivo no existe: $ARCHIVO_PATH"
        continue
    fi

    # Llamar a Ollama escribiendo el JSON a un archivo
    log "🧠 Llamando a Ollama..."
    PROMPT_FILE=$(mktemp)
    cat > "$PROMPT_FILE" << 'PROMPT_EOF'
Eres un desarrollador TypeScript/React experto. Edita el archivo según la instrucción.

Reglas:
- Textos de UI en español con acentos
- Sin 'any', tipos estrictos
- Tests con import { describe, it, expect } from 'vitest'
- cursor-pointer en lo clicable

Responde SOLO con el contenido completo del archivo modificado. Sin explicaciones.
PROMPT_EOF

    RESPUESTA=$(python3 << PYEOF
import json, urllib.request

with open("$ARCHIVO_PATH") as f:
    contenido = f.read()

prompt = """Eres un desarrollador TypeScript/React experto. Edita el archivo según la instrucción.

Archivo actual ($ARCHIVOS):
$contenido

Instrucción:
$PROMPT

Reglas:
- Textos de UI en español con acentos
- Sin 'any', tipos estrictos
- Tests con import {{ describe, it, expect }} from 'vitest'
- cursor-pointer en lo clicable

Responde SOLO con el contenido completo del archivo modificado. Sin explicaciones, sin markdown."""

payload = {
    "model": "$MODELO",
    "messages": [{"role": "user", "content": prompt}],
    "stream": False,
}

try:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("http://localhost:11434/api/chat", data=data,
                                headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
        print(result.get("message", {}).get("content", ""))
except Exception as e:
    print("")
PYEOF
)

    rm -f "$PROMPT_FILE"

    if [ -z "$RESPUESTA" ]; then
        log "❌ Ollama no respondió"
        sleep 5
        continue
    fi

    # Escribir archivo
    echo "$RESPUESTA" > "$ARCHIVO_PATH"
    log "✍️  Escrito: $ARCHIVOS ($(echo "$RESPUESTA" | wc -l) líneas)"

    # Commit
    cd "$WT_PATH"
    git add . && git commit -m "fix: ${TITULO:0:60}" 2>&1 | tee -a "$LOG" || true
    cd "$RAIZ"

    # Actualizar estado
    python3 -c "
import json
with open('$COLA') as f:
    cola = json.load(f)
for t in cola:
    if t.get('id') == '$TID':
        t['estado'] = 'hecho'
with open('$COLA', 'w') as f:
    json.dump(cola, f, ensure_ascii=False, indent=1)
"

    log "✅ $TID completado"
    sleep 3
done

log "🎉 Procesamiento terminado"
