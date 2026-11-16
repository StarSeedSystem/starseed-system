#!/bin/bash
# StarSeed · Modelo privado en el A1 de Oracle (Always Free), SOLO en 127.0.0.1:11434. Idempotente.
#
# POR QUÉ (2026-10-20, Alex: «sí, se aprueba lo sugerido»): un servidor con un modelo
# privado para tareas de alta capacidad que no entran en los gratuitos. El modelo se
# instala localmente y se sirve vía Ollama con alias starseed-privado.
#
# USO: bash deploy/oracle/nodo/modelo-privado-a1.sh [instalar|estado|deshacer] [4b|9b]
#       Por defecto: instalar con modelo 4b, tamaño huihui_ai/qwen3.5-abliterated.
#
# MEMORIA (2026-10-20): APAGADO. Alex: «hazlo solo si mejora u optimiza los procesos».
# Los modelos siguen en el disco del A1 (8 GB libres). Encender cuando algo lo use:
#       bash deploy/oracle/nodo/modelo-privado-a1.sh instalar 4b
#       Apagar: systemctl disable --now ollama-privado
#
# Guardas: un solo modelo cargado, prioridad media (Nice 10, CPUWeight 50) y techo de memoria
# para no tumbar BitNet, FreeLLMAPI, el guardián o los trabajadores. Nada se abre a internet.
# Modelo: Apache 2.0 (comprobado con `ollama show … --license`); nada no comercial.
#
# Estimados por tamaño:
# - 4B: qwen3.5-1.5B (1.5 GB) o huihui_ai/qwen3.5-abliterated:4b (4.5 GB en Q4_K_M)
# - 9B: huihui_ai/qwen3.5-abliterated:9b (8.5 GB en Q4_K_M)
#
# SUBCOMANDOS:
# - instalar [4b|9b]: instala Ollama con el instalador oficial si falta, crea el drop-in,
#   pull del modelo, verifica licencia y crea el alias starseed-privado.
# - estado: muestra versión, etiquetas del modelo y memoria usada por la unidad.
# - deshacer: detiene el servicio, borra el drop-in y el alias, indica cuántos GB ocupan
#   los pesos y el comando para quitarlos.

set -euo pipefail

COMMAND="${1:-instalar}"
TAMANIO="${2:-4b}"

OLLAMA_SERVICE="ollama"
OLLAMA_SERVICE_PRIVADO="ollama-privado"
DROP_IN_PATH="/etc/systemd/system/${OLLAMA_SERVICE}.d/starseed-privado.conf"
ALIAS_NAME="starseed-privado"
MODEL_4B="huihui_ai/qwen3.5-abliterated:4b"
MODEL_9B="huihui_ai/qwen3.5-abliterated:9b"

get_modelo() {
    case "$TAMANIO" in
        4b) echo "$MODEL_4B" ;;
        9b) echo "$MODEL_9B" ;;
        *) echo "$MODEL_4B" ;;
    esac
}

get_memoria_4b() {
    echo "MemoryHigh=4500M
MemoryMax=5200M"
}

get_memoria_9b() {
    echo "MemoryHigh=8000M
MemoryMax=9000M"
}

get_memoria() {
    case "$TAMANIO" in
        4b) get_memoria_4b ;;
        9b) get_memoria_9b ;;
        *) get_memoria_4b ;;
    esac
}

instalar() {
    echo "=== Instalando modelo privado en el A1 de Oracle ==="
    
    if ! command -v ollama >/dev/null 2>&1; then
        echo "Ollama no encontrado, instalando desde el instalador oficial..."
        curl -fsSL https://ollama.com/install.sh -o /tmp/ollama-install.sh
        sudo sh /tmp/ollama-install.sh
    fi
    
    sudo mkdir -p /etc/systemd/system/ollama.service.d
    
    local memoria
    memoria=$(get_memoria)
    
    sudo tee "$DROP_IN_PATH" >/dev/null << CONFI
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=2m"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
Nice=10
CPUWeight=50
$memoria
CONFI
    
    sudo systemctl daemon-reload
    sudo systemctl enable ollama >/dev/null 2>&1 || true
    sudo systemctl restart ollama
    
    echo "Esperando a que Ollama esté disponible..."
    for _ in $(seq 1 20); do
        curl -fs 127.0.0.1:11434/api/version >/dev/null && break
        sleep 1
    done
    
    local modelo
    modelo=$(get_modelo)
    
    echo "Descargando modelo: $modelo"
    ollama pull "$modelo"
    
    echo "Verificando licencia..."
    local licencia
    licencia=$(ollama show "$modelo" --license 2>/dev/null | grep -m1 -oE 'Apache License|MIT License' || echo "REVISAR: no es Apache ni MIT")
    echo "$modelo · licencia: $licencia"
    
    echo "Creando alias $ALIAS_NAME..."
    ollama create "$ALIAS_NAME" --modelfile <(cat << MODELF
FROM $modelo
PARAMETER num_ctx 8192
MODELF
)
    
    echo "ollama $(ollama --version | awk '{print $NF}') · ${modelo} listo en 127.0.0.1:11434 con alias $ALIAS_NAME"
}

estado() {
    echo "=== Estado del modelo privado ==="
    
    if ! systemctl is-active --quiet ollama; then
        echo "Ollama: no activo"
        return 1
    fi
    
    echo "Ollama: activo"
    echo "Versión: $(ollama --version)"
    
    if ollama ps | grep -q "^${ALIAS_NAME} "; then
        echo "Alias $ALIAS_NAME: cargado"
    else
        echo "Alias $ALIAS_NAME: no cargado"
    fi
    
    echo ""
    echo "Modelos disponibles:"
    ollama list
    
    echo ""
    echo "Memoria del sistema:"
    free -h | grep Mem
    
    echo ""
    echo "Uso de disco de modelos:"
    local modelo
    modelo=$(get_modelo)
    local peso_dir="/usr/share/ollama/.ollama/models"
    if [ -d "$peso_dir" ]; then
        du -sh "$peso_dir" 2>/dev/null || echo "No se puede medir el uso de disco"
    fi
}

deshacer() {
    echo "=== Deshaciendo instalación del modelo privado ==="
    
    sudo systemctl disable --now "$OLLAMA_SERVICE" 2>/dev/null || true
    sudo rm -f "$DROP_IN_PATH"
    sudo systemctl daemon-reload
    
    ollama rm "$ALIAS_NAME" 2>/dev/null || true
    
    local modelo
    modelo=$(get_modelo)
    ollama rm "$modelo" 2>/dev/null || true
    
    echo ""
    echo "Modelos eliminados del alias y del modelo base."
    
    local peso_dir="/usr/share/ollama/.ollama/models"
    if [ -d "$peso_dir" ]; then
        local gb
        gb=$(du -sh "$peso_dir" 2>/dev/null | awk '{print $1}')
        echo "Espacio ocupado actualmente: $gb"
    fi
    
    echo ""
    echo "Para eliminar completamente los pesos del modelo, ejecuta:"
    echo "  sudo rm -rf $peso_dir"
}

case "$COMMAND" in
    instalar) instalar ;;
    estado) estado ;;
    deshacer) deshacer ;;
    *) echo "Uso: $0 {instalar|estado|deshacer} [4b|9b]" >&2; exit 1 ;;
esac