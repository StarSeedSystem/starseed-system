#!/usr/bin/env bash
#
# Instalador idempotente de oído para Oracle A1 (Phonon-2 en CPU)
# Para uso exclusivo del servidor de oído 24/7 de la malla
#

set -euo pipefail

# Directorios de instalación
OIDO_DIR="$HOME/oido"
VENV_DIR="$OIDO_DIR/venv"
CONFIG_DIR="$HOME/.starseed"
ENV_FILE="$CONFIG_DIR/oidoclaque.env"  # Archivo para la clave de API

# Funciones de utilidad
print_status() {
    local level="$1"
    local message="$2"
    echo -e "${level}${message}"
}

check_free_memory() {
    local required_mb=1536  # 1,5 GB en MB
    local free_mb
    
    free_mb=$(free -m | awk '/^Mem:/{print $7}')
    
    if [[ "$free_mb" -lt "$required_mb" ]]; then
        print_status "\033[0;31mError: Se necesitan al menos 1,5 GB de memoria libre.\033[0m"
        print_status "\033[0;33mMemoria libre actual: ${free_mb} MB\033[0m"
        exit 1
    fi
}

create_directories() {
    if [ ! -d "$OIDO_DIR" ]; then
        print_status "\033[0;34mCreando directorio de instalación: \033[0m$OIDO_DIR"
        mkdir -p "$OIDO_DIR"
    else
        print_status "\033[0;32mEl directorio de instalación ya existe.\033[0m"
    fi
    
    if [ ! -d "$CONFIG_DIR" ]; then
        print_status "\033[0;34mCreando directorio de configuración: \033[0m$CONFIG_DIR"
        mkdir -p "$CONFIG_DIR"
    else
        print_status "\033[0;32mEl directorio de configuración ya existe.\033[0m"
    fi
}

create_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        print_status "\033[0;34mCreando entorno virtual en: \033[0m$VENV_DIR"
        python3 -m venv "$VENV_DIR"
    else
        print_status "\033[0;32mEl entorno virtual ya existe.\033[0m"
    fi
    
    # Activar el entorno virtual
    source "$VENV_DIR/bin/activate"
}

install_torch_cpu() {
    print_status "\033[1;33mInstalando torch de CPU (optimizado para Oracle A1)...\033[0m"
    pip install --no-deps torch --index-url https://download.pytorch.org/whl/cpu
}

install_fermion() {
    print_status "\033[1;33mInstalando fermion-research...\033[0m"
    pip install fermion-research
}

verify_installation() {
    print_status "\033[0;34mVerificando instalación de Phonon-2...\033[0m"
    
    if command -v fermion &> /dev/null; then
        local version
        version=$(fermion --version 2>/dev/null || echo "Desconocida")
        print_status "\033[0;32mPhonon-2 está disponible (versión: $version).\033[0m"
    else
        print_status "\033[0;31mError: Phonon-2 no está instalado o no está en el PATH.\033[0m"
        exit 1
    fi
    
    # Verificar que podemos ejecutar el servidor
    print_status "\033[0;34mProbando ejecución básica de fermion...\033[0m"
    fermion serve phonon-2 --help > /dev/null 2>&1 && \
        print_status "\033[0;32mComando fermion serve phonon-2 disponible.\033[0m" || \
        print_status "\033[0;33mAdvertencia: No se pudo verificar el comando completo.\033[0m"
}

create_env_file() {
    # Solo crear el archivo de entorno si no existe
    if [ ! -f "$ENV_FILE" ]; then
        print_status "\033[0;34mCreando archivo de entorno para la clave de API: \033[0m$ENV_FILE"
        # El archivo quedará vacío inicialmente; el valor será puesto por Alex
        touch "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        print_status "\033[0;33mArchivo de entorno creado con permisos 600.\033[0m"
        print_status "\033[0;33mAlex debe poner la variable OIDO_CLAVE en este archivo.\033[0m"
    else
        print_status "\033[0;32mEl archivo de entorno ya existe.\033[0m"
        # Asegurar que tenga los permisos correctos
        chmod 600 "$ENV_FILE"
    fi
}

main() {
    print_status "\033[0;32m=== Instalador de oído para Oracle A1 (Phonon-2 CPU) ===\033[0m"
    print_status "\033[1;33mUsuario: $(whoami)\033[0m"
    print_status "\033[1;33mDirectorio de instalación: \033[0m$OIDO_DIR"
    
    # Verificar que estamos ejecutando como usuario starseed
    if [ "$(whoami)" != "starseed" ]; then
        print_status "\033[0;33mAdvertencia: Se recomienda ejecutar como usuario 'starseed'.\033[0m"
    fi
    
    check_free_memory
    create_directories
    create_venv
    install_torch_cpu
    install_fermion
    verify_installation
    create_env_file
    
    print_status "\033[0;32m=== Instalación completada ===\033[0m"
    print_status "\033[1;33mUbicación del entorno virtual:\033[0m $VENV_DIR"
    print_status "\033[1;33mArchivo de entorno para la clave:\033[0m $ENV_FILE"
    print_status "\033[0;33mRecuerde que Alex debe poner OIDO_CLAVE en el archivo de entorno.\033[0m"
    print_status "\033[1;33mCómo ejecutar Phonon-2 manualmente:\033[0m"
    print_status "  source $VENV_DIR/bin/activate"
    print_status "  fermion serve phonon-2 --host 127.0.0.1 --port 4470 --threads 2 --api-key \$OIDO_CLAVE"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi