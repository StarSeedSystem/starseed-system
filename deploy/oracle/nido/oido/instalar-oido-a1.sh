#!/usr/bin/env bash
# Instalador idempotente para el oído de Oracle A1 (Phonon-2)
# Se ejecuta como usuario starseed
# Instala en /home/starseed/oido/venv

set -euo pipefail

# Configuración
VENV_PATH="/home/starseed/oido/venv"
REQUIRED_FREE_MEM_MB=1500

# Funciones
log() {
    echo "[instalar-oido-a1] $*"
}

check_free_memory() {
    local free_mem_kb
    free_mem_kb=$(awk '/MemFree/ {print $2}' /proc/meminfo)
    local free_mem_mb=$((free_mem_kb / 1024))
    if (( free_mem_mb < REQUIRED_FREE_MEM_MB )); then
        log "Error: Memoria libre insuficiente: ${free_mem_mb} MB < ${REQUIRED_FREE_MEM_MB} MB"
        return 1
    fi
    log "Memoria libre: ${free_mem_mb} MB (≥ ${REQUIRED_FREE_MEM_MB} MB)"
    return 0
}

create_venv() {
    if [[ -d "$VENV_PATH" ]]; then
        log "Entorno virtual ya existe en $VENV_PATH"
    else
        log "Creando entorno virtual en $VENV_PATH"
        python3 -m venv "$VENV_PATH"
    fi
}

install_torch_cpu() {
    local pip_path="$VENV_PATH/bin/pip"
    if "$pip_path" list | grep -q torch; then
        log "Torch ya está instalado"
    else
        log "Instalando torch para CPU"
        "$pip_path" install --no-deps torch --index-url https://download.pytorch.org/whl/cpu
    fi
}

install_fermion() {
    local pip_path="$VENV_PATH/bin/pip"
    if "$pip_path" list | grep -q fermion-research; then
        log "fermion-research ya está instalado"
    else
        log "Instalando fermion-research"
        "$pip_path" install fermion-research
    fi
}

main() {
    log "Iniciando instalación del oído para Oracle A1"
    
    # Verificar que estamos como usuario starseed (opcional, pero bueno)
    if [[ "$(whoami)" != "starseed" ]]; then
        log "Advertencia: Este script está pensado para ejecutarse como usuario starseed, pero se está ejecutando como $(whoami)"
    fi
    
    check_free_memory
    create_venv
    install_torch_cpu
    install_fermion
    
    log "Instalación completada"
}

main "$@"