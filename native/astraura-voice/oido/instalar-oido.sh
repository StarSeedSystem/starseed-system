#!/bin/bash
#
# Instalador de oído Astraura (Phonon-2) para StarSeed OS
# Componente modular con detección de plataforma e instalación idempotente
#

CONFIG_DIR="${STARSEED_ASTRAURA_DIR:-$HOME/.astraura}"
OIDO_DIR="$CONFIG_DIR/oido"
VENV_DIR="$OIDO_DIR/venv"

print_status() {
    local level="$1"
    local message="$2"
    echo -e "${level}${message}"
}

check_free_space() {
    local required_mb=3072
    local free_mb

    if command -v df &> /dev/null; then
        free_mb=$(df --output=avail "$VENV_DIR" | tail -n1 | tr -d ' ')
    else
        free_mb=$(df -h "$VENV_DIR" | tail -n1 | awk '{print $4}')
    fi

    if [[ "$free_mb" -lt "$required_mb" ]]; then
        echo -e "\033[0;31mError: Se necesitan al menos 3 GB de espacio libre para el entorno virtual.\033[0m"
        exit 1
    fi
}

create_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        print_status "\033[0;34mCreando entorno virtual en: \033[0m$VENV_DIR"
        python3 -m venv "$VENV_DIR"
    else
        print_status "\033[0;32mEl entorno virtual ya existe.\033[0m"
    fi

    source "$VENV_DIR/bin/activate"
    print_status "\033[1;33mActualizando pip...\033[0m"
    pip install --upgrade pip
}

install_dependencies() {
    local platform="$(uname -s)"

    print_status "\033[0;34mInstalando dependencias del sistema...\033[0m"

    case "$platform" in
        Darwin)
            print_status "\033[1;33mDetectado macOS (Apple Silicon). Instalando fermion-research.\033[0m"
            pip install fermion-research
            ;;
        Linux)
            print_status "\033[1;33mDetectado Linux. Instalando torch de CPU...\033[0m"
            pip install --no-deps torch --index-url https://download.pytorch.org/whl/cpu

            print_status "\033[1;33mInstalando fermion-research y onnx-asr[cpu,hub]\033[0m"
            pip install fermion-research
            pip install onnx-asr[cpu,hub]
            ;;
        *)
            echo -e "\033[0;31mError: Plataforma no soportada: $platform\033[0m"
            exit 1
            ;;
    esac

    print_status "\033[0;32mDependencias instaladas.\033[0m"
}

check_phonon() {
    print_status "\033[0;34mVerificando Phonon-2...\033[0m"

    if command -v fermion &> /dev/null; then
        local version
        version=$(fermion --version 2>/dev/null || echo "Desconocida")
        print_status "\033[0;32mPhonon-2 está disponible (versión: $version).\033[0m"
    else
        echo -e "\033[0;31mError: Phonon-2 no está instalado o no está en el PATH.\033[0m"
        exit 1
    fi
}

main() {
    print_status "\033[0;32m=== Instalador de oído Astraura (Phonon-2) ===\033[0m"
    print_status "\033[1;33mDirectorio de instalación: \033[0m$OIDO_DIR"

    check_free_space
    create_venv
    install_dependencies
    check_phonon

    print_status "\033[0;32m=== Instalación completada ===\033[0m"
    print_status "\033[1;33mUbicación del entorno virtual:\033[0m $VENV_DIR"
    print_status "\033[1;33mCómo ejecutar Phonon-2:\033[0m"
    print_status "  source $VENV_DIR/bin/activate"
    print_status "  fermion serve phonon-2 --host 127.0.0.1 --port 4470 --threads 2"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
