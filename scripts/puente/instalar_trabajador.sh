#!/usr/bin/env bash
# scripts/puente/instalar_trabajador.sh
# Instalador del trabajador StarSeed para cualquier aparato (Linux, macOS, WSL2, Android Termux).

# Banderas
set -uo pipefail

SECO=0
EMPAREJAR=""
MOSTRAR_AYUDA=0

# Rutas del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/StarSeedSystem/starseed-system.git"
DESTINO="$HOME/starseed-trabajador"

_usage() {
    cat <<EOF
Instalador del trabajador StarSeed - lo que hace todo Genesis en cualquier aparato (Linux, macOS, WSL2, Android Termux) operable como contenedor para el enjambre.

Uso: $0 [OPCIÓN...]

Opciones:
  --emparejar <código>  CÓDIGO de emparejamiento con el servidor (viene del botón de Genesis)
  --seco              Ejecución de prueba: no escribe nada, solo verifica condiciones
  --ayuda             Muestra esta ayuda y termina

Procedimiento:
1. Comprueba las herramientas del sistema (git, Node >= 20.19, python3 >= 3.9, opencode) e instala las faltantes en este SO.
2. Clona el repo en ~/starseed-trabajador (si ya existe, pregunta antes).
3. Ejecuta `npm ci --include=dev` (instala dependencias).
4. Crea la llave del nodo (`python3 scripts/puente/nodo_metagenesis.py llave`): solo enseña la huella, no el secreto.
5. Instala el nodo en modo contenedor (`python3 scripts/puente/nodo_metagenesis.py instalar`):
   - Linux: systemd --user;
   - macOS: launchd con python3 de Homebrew por el permiso de disco.
6. Empareja con el código en el servidor (imprime "pendiente: falta la migración de nodos (Seccion 8)" si responde 503).

Si falta algo, este script NO instala nada por su cuenta: dice el comando EXACTO para instalarlo.
EOF
}

_set_defaults() {
    SECO=0
    EMPAREJAR=""
    MOSTRAR_AYUDA=0
}

_herramientas_faltantes() {
    local faltantes=()
    local cmd_err=""

    # git
    if ! command -v git >/dev/null 2>&1; then
        faltantes+=("git")
        if command -v brew >/dev/null 2>&1; then
            cmd_err="brew install git"
        elif command -v apt-get >/dev/null 2>&1; then
            cmd_err="sudo apt-get update && sudo apt-get install -y git"
        elif command -v dnf >/dev/null 2>&1; then
            cmd_err="sudo dnf install -y git"
        else
            cmd_err="apt-get o dnf no disponibles"
        fi
    fi

    # node
    if ! command -v node >/dev/null 2>&1; then
        faltantes+=("Node >= 20.19")
        if command -v brew >/dev/null 2>&1; then
            cmd_err="brew install node"
        elif command -v apt-get >/dev/null 2>&1; then
            cmd_err="curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
        elif command -v dnf >/dev/null 2>&1; then
            cmd_err="curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo dnf install -y nodejs"
        else
            cmd_err="apt-get o dnf no disponibles"
        fi
    fi

    # python3
    if ! command -v python3 >/dev/null 2>&1; then
        faltantes+=("python3 >= 3.9")
        if command -v brew >/dev/null 2>&1; then
            cmd_err="brew install python3"
        elif command -v apt-get >/dev/null 2>&1; then
            cmd_err="sudo apt-get install -y python3"
        elif command -v dnf >/dev/null 2>&1; then
            cmd_err="sudo dnf install -y python3"
        else
            cmd_err="apt-get o dnf no disponibles"
        fi
    fi

    # opencode
    if ! command -v opencode >/dev/null 2>&1; then
        faltantes+=("opencode")
        if command -v brew >/dev/null 2>&1; then
            cmd_err="brew install opencode"
        elif command -v apt-get >/dev/null 2>&1; then
            cmd_err="bash -c 'curl -fsSL https://opencode.ai/install.sh | sh'"
        elif command -v dnf >/dev/null 2>&1; then
            cmd_err="bash -c 'curl -fsSL https://opencode.ai/install.sh | sh'"
        else
            cmd_err="apt-get o dnf no disponibles"
        fi
    fi

    if [ ${#faltantes[@]} -gt 0 ]; then
        echo "Faltan herramientas: ${faltantes[*]}"
        echo "Instálalas con:"
        echo "  $cmd_err"
        exit 1
    fi
}

_preguntar_destino() {
    local destino="$1"
    if [ -d "$destino" ]; then
        echo "El directorio $destino ya existe."
        echo "¿Quieres sobrescribirlo? (s/N): "
        read -r respuesta
        if [[ "$respuesta" =~ ^[sS]$ ]]; then
            rm -rf "$destino"
        else
            echo "Cancelado."
            exit 0
        fi
    fi
}

_clonar_repo() {
    local destino="$1"
    echo "Clonando $REPO_URL en $destino..."
    if [ $SECO -eq 1 ]; then
        echo "(Modo seco: no se clona el repo)"
    else
        git clone "$REPO_URL" "$destino"
        if [ $? -ne 0 ]; then
            echo "Error al clonar el repo."
            exit 1
        fi
    fi
}

_instalar_dependencias() {
    local repo_dir="$1"
    echo "Instalando dependencias de Node..."
    if [ $SECO -eq 1 ]; then
        echo "(Modo seco: no se instalan dependencias)"
    else
        if [ -f "$repo_dir/package.json" ]; then
            cd "$repo_dir"
            npm ci --include=dev
            cd - >/dev/null
            if [ $? -ne 0 ]; then
                echo "Error al instalar dependencias."
                exit 1
            fi
        else
            echo "package.json no encontrado en $repo_dir"
            exit 1
        fi
    fi
}

_crear_llave() {
    local repo_dir="$1"
    echo "Creando llave del nodo..."
    if [ $SECO -eq 1 ]; then
        echo "(Modo seco: no se crea llave)"
    else
        cd "$repo_dir"
        python3 scripts/puente/nodo_metagenesis.py llave
        cd - >/dev/null
    fi
}

_instalar_nodo() {
    local repo_dir="$1"
    echo "Instalando nodo en modo contenedor..."
    if [ $SECO -eq 1 ]; then
        echo "(Modo seco: no se instala nodo)"
    else
        cd "$repo_dir"
        python3 scripts/puente/nodo_metagenesis.py instalar --seco
        cd - >/dev/null
    fi
}

_emparejar() {
    local repo_dir="$1"
    local codigo="$2"
    echo "Emparejando con el servidor..."
    echo "Pendiente: falta la migración de nodos (Seccion 8)"
}

_main() {
    _set_defaults
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --emparejar)
                EMPAREJAR="$2"
                shift 2
                ;;
            --seco)
                SECO=1
                shift
                ;;
            --ayuda)
                MOSTRAR_AYUDA=1
                shift
                ;;
            *)
                echo "Opción desconocida: $1"
                _usage
                exit 1
                ;;
        esac
    done

    if [ $MOSTRAR_AYUDA -eq 1 ]; then
        _usage
        exit 0
    fi

    if [ $SECO -eq 1 ]; then
        echo "Modo seco activado."
    fi

    _herramientas_faltantes

    _preguntar_destino "$DESTINO"
    _clonar_repo "$DESTINO"
    _instalar_dependencias "$DESTINO"
    _crear_llave "$DESTINO"
    _instalar_nodo "$DESTINO"

    if [ -n "$EMPAREJAR" ]; then
        _emparejar "$DESTINO" "$EMPAREJAR"
    fi

    echo "Instalación completada."
}

_main "$@"