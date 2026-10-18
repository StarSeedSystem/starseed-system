#!/usr/bin/env bash
# Instalador idempotente para OIDO en nodo A1
# Usuario: starseed
# Directorio: /home/starseed/oido/venv

set -euo pipefail

USER_STARSEED=starseed
HOME_STARSEED=/home/$USER_STARSEED
OIDO_DIR=$HOME_STARSEED/oido
VENV_DIR=$OIDO_DIR/venv
ENV_FILE=$OIDO_DIR/oido.env

# Función para mensaje
log() {
    echo "[instalar-oido-a1] $*"
}

# Comprobar que se ejecuta como root o con sudo para cambiar a starseed
if [ "$(id -u)" -eq 0 ]; then
    log "Ejecutándose como root, cambiando a usuario $USER_STARSEED"
    exec sudo -u $USER_STARSEED "$0" "$@"
fi

# Ahora somos starseed
log "Iniciando instalación para usuario $USER"

# Crear directorio si no existe
mkdir -p "$OIDO_DIR"

# Crear entorno virtual si no existe
if [ ! -d "$VENV_DIR" ]; then
    log "Creando entorno virtual en $VENV_DIR"
    python3 -m venv "$VENV_DIR"
else
    log "Entorno virtual ya existe en $VENV_DIR"
fi

# Activar entorno virtual
source "$VENV_DIR/bin/activate"

# Instalar torch CPU primero (idempotente)
log "Instalando torch (CPU)"
pip install --no-deps torch --index-url https://download.pytorch.org/whl/cpu

# Instalar fermion-research
log "Instalando fermion-research"
pip install fermion-research

# Crear archivo de entorno de ejemplo si no existe (clave no se almacena aquí)
if [ ! -f "$ENV_FILE" ]; then
    log "Creando archivo de entorno de ejemplo en $ENV_FILE (establecer OIDO_CLAVE real con permisos 600)"
    echo "# Variable de entorno para OIDO" > "$ENV_FILE"
    echo "# OIDO_CLAVE=tu_clave_secreta_aqui" >> "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "Archivo de entorno creado con permisos 600. Edítelo para poner la clave real."
else
    log "Archivo de entorno ya existe en $ENV_FILE"
fi

log "Instalación completada."