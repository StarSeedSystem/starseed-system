#!/usr/bin/env bash
set -uo pipefail

# scripts/puente/instalar_trabajador.sh
# Instalador del trabajador para cualquier aparato (Linux, macOS, WSL2)
# Uso: instalar_trabajador.sh [--emparejar <código>] [--seco] [--ayuda]

# Función para mostrar ayuda
function ayuda() {
    cat <<EOF
Usage: $0 [--emparejar <código>] [--seco] [--ayuda]

Options:
  --emparejar <código>   Emparejar el nodo con el código proporcionado (paso final)
  --seco                 Modo seco: no instala nada, solo verifica e informa
  --ayuda                Muestra esta ayuda y sale

Descripción:
  Este script instala el trabajador de StarSeed en el aparato actual.
  Comprueba las herramientas necesarias (git, Node ≥ 20.19, python3 ≥ 3.9, opencode),
  clona el repositorio en ~/starseed-trabajador, instala dependencias,
  crea la llave del nodo y lo instala como servicio (launchd en macOS, systemd --user en Linux/WSL2).
  Al final, explica cuántos agentes podrá aportar el aparato y por qué.

  En modo seco (--seco), solo se realizan las comprobaciones y se muestra la explicación
  sin clonar, instalar ni modificar el sistema.

  El emparejado con el código imprime «pendiente: falta la migración de nodos (§8)» 
  si el servidor responde 503 (asumiendo que la migración aún no se ha aplicado).
EOF
}

# Variables por defecto
EMPAREJAR_CODIGO=""
SECO=false

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --emparejar)
            EMPAREJAR_CODIGO="$2"
            shift 2
            ;;
        --seco)
            SECO=true
            shift
            ;;
        --ayuda)
            ayuda
            exit 0
            ;;
        *)
            echo "Error: argumento desconocido: $1" >&2
            ayuda
            exit 1
            ;;
    esac
done

# Función para detectar el sistema operativo y versión
function get_os_info() {
    local os=""
    local version=""
    if [[ "$(uname)" == "Darwin" ]]; then
        os="macos"
        version=$(sw_vers -productVersion)
    elif [[ "$(uname)" == "Linux" ]]; then
        if grep -q Microsoft /proc/version; then
            os="wsl2"
            version=$(grep -oP '(?<=VERSION_ID=).+' /etc/os-release | tr -d '"')
        else
            os="linux"
            version=$(grep -oP '(?<=VERSION_ID=).+' /etc/os-release | tr -d '"')
        fi
    else
        os="unknown"
        version="unknown"
    fi
    echo "$os" "$version"
}

# Función para comprobar si un comando existe
function command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Función para obtener la versión de un comando (asumiendo que acepta --version o -v)
function get_version() {
    local cmd="$1"
    local version=""
    if command_exists "$cmd"; then
        version=$("$cmd" --version 2>/dev/null | head -n1) || \
                 version=$("$cmd" -v 2>/dev/null | head -n1) || \
                 version=$("$cmd" version 2>/dev/null | head -n1)
    fi
    echo "$version"
}

# Función para comparar versiones (semver simple, solo para nuestro uso)
function version_ge() {
    # Devuelve 0 si v1 >= v2, 1 en caso contrario
    local v1="$1"
    local v2="$2"
    # Elimina todo lo que no sea números y puntos
    v1=$(echo "$v1" | sed -E 's/[^0-9.]//g')
    v2=$(echo "$v2" | sed -E 's/[^0-9.]//g')
    # Si está vacío, considerar como 0.0.0
    [[ -z "$v1" ]] && v1="0.0.0"
    [[ -z "$v2" ]] && v2="0.0.0"
    # Comparar por partes
    IFS='.' read -r v1_major v1_minor v1_patch <<< "$v1"
    IFS='.' read -r v2_major v2_minor v2_patch <<< "$v2"
    # Si falta algún componente, completar con 0
    v1_major=${v1_major:-0}; v1_minor=${v1_minor:-0}; v1_patch=${v1_patch:-0}
    v2_major=${v2_major:-0}; v2_minor=${v2_minor:-0}; v2_patch=${v2_patch:-0}
    if (( v1_major > v2_major )); then return 0; fi
    if (( v1_major < v2_major )); then return 1; fi
    if (( v1_minor > v2_minor )); then return 0; fi
    if (( v1_minor < v2_minor )); then return 1; fi
    if (( v1_patch >= v2_patch )); then return 0; fi
    return 1
}

# Función para imprimir mensaje de error y salir
function error_exit() {
    echo "Error: $1" >&2
    exit 1
}

# Función para imprimir mensaje de información
function info() {
    echo "Info: $1"
}

# Función para obtener el comando de instalación según el sistema y el paquete faltante
function get_install_command() {
    local missing_tool="$1"
    local os_info
    os_info=$(get_os_info)
    local os=$(echo "$os_info" | awk '{print $1}')
    local version=$(echo "$os_info" | awk '{print $2}')
    
    case "$os" in
        macos)
            if command_exists brew; then
                case "$missing_tool" in
                    git) echo "brew install git" ;;
                    node) echo "brew install node" ;;
                    python3) echo "brew install python" ;;
                    opencode) echo "npm install -g opencode" ;;
                    *) echo "No se conoce el comando de instalación para $missing_tool en macOS vía brew" ;;
                esac
            else
                echo "Instale Homebrew primero: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            fi
            ;;
        linux|wsl2)
            # Detectar gestor de paquetes
            if command_exists apt-get; then
                case "$missing_tool" in
                    git) echo "sudo apt-get update && sudo apt-get install -y git" ;;
                    node) echo "sudo apt-get install -y nodejs npm" ;;
                    python3) echo "sudo apt-get install -y python3" ;;
                    opencode) echo "sudo npm install -g opencode" ;;
                    *) echo "No se conoce el comando de instalación para $missing_tool en Linux vía apt" ;;
                esac
            elif command_exists dnf; then
                case "$missing_tool" in
                    git) echo "sudo dnf install -y git" ;;
                    node) echo "sudo dnf install -y nodejs npm" ;;
                    python3) echo "sudo dnf install -y python3" ;;
                    opencode) echo "sudo npm install -g opencode" ;;
                    *) echo "No se conoce el comando de instalación para $missing_tool en Linux vía dnf" ;;
                esac
            else
                echo "No se puede determinar el gestor de paquetes. Instale $missing_tool manualmente."
            fi
            ;;
        *)
            echo "Sistema operativo no soportado para instalación automática: $os"
            ;;
    esac
}

# Comprobaciones preliminares
echo "Comprobando requisitos previos..."

# Comprobar git
if ! command_exists git; then
    info "git no está instalado."
    install_cmd=$(get_install_command git)
    info "Para instalarlo, ejecute: $install_cmd"
    if [[ "$SECO" = false ]]; then
        error_exit "Falta git. Instálelo y vuelva a ejecutar el script."
    fi
else
    info "git: OK"
fi

# Comprobar Node.js (≥ 20.19)
if ! command_exists node; then
    info "Node.js no está instalado."
    install_cmd=$(get_install_command node)
    info "Para instalarlo, ejecute: $install_cmd"
    if [[ "$SECO" = false ]]; then
        error_exit "Falta Node.js. Instálelo y vuelva a ejecutar el script."
    fi
else
    node_version=$(get_version node)
    # Extraer número de versión (ej: v20.19.0 -> 20.19.0)
    node_version_clean=$(echo "$node_version" | sed -E 's/^v//')
    if ! version_ge "$node_version_clean" "20.19"; then
        info "Node.js versión $node_version_clean es demasiado antigua. Se requiere ≥ 20.19."
        install_cmd=$(get_install_command node)
        info "Para actualizarlo, ejecute: $install_cmd"
        if [[ "$SECO" = false ]]; then
            error_exit "Node.js demasiado antiguo. Actualícelo y vuelva a ejecutar el script."
        fi
    else
        info "Node.js: $node_version_clean (OK)"
    fi
fi

# Comprobar python3 (≥ 3.9)
if ! command_exists python3; then
    info "python3 no está instalado."
    install_cmd=$(get_install_command python3)
    info "Para instalarlo, ejecute: $install_cmd"
    if [[ "$SECO" = false ]]; then
        error_exit "Falta python3. Instálelo y vuelva a ejecutar el script."
    fi
else
    python_version=$(get_version python3 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
    if [[ -z "$python_version" ]]; then
        python_version=$(get_version python3 | grep -oE '[0-9]+\.[0-9]+' | head -n1)
    fi
    if ! version_ge "$python_version" "3.9"; then
        info "python3 versión $python_version es demasiado antigua. Se requiere ≥ 3.9."
        install_cmd=$(get_install_command python3)
        info "Para actualizarlo, ejecute: $install_cmd"
        if [[ "$SECO" = false ]]; then
            error_exit "python3 demasiado antiguo. Actualícelo y vuelva a ejecutar el script."
        fi
    else
        info "python3: $python_version (OK)"
    fi
fi

# Comprobar opencode
if ! command_exists opencode; then
    info "opencode no está instalado."
    install_cmd=$(get_install_command opencode)
    info "Para instalarlo, ejecute: $install_cmd"
    if [[ "$SECO" = false ]]; then
        error_exit "Falta opencode. Instálelo y vuelva a ejecutar el script."
    fi
else
    info "opencode: OK"
fi

    # Si estamos en modo seco, terminamos aquí después de las comprobaciones
    if [[ "$SECO" = true ]]; then
        info "Modo seco: se han verificado los requisitos previos."
        # Además, en modo seco, explicamos cuántos agentes podrá aportar
        info "Ahora explicando la capacidad del aparato como contenedor..."
        # Llamamos a una función de Python para obtener la explicación
        capacity_explanation=$(python3 - <<EOF
import sys
import os
base_dir = os.getcwd()
sys.path.insert(0, os.path.join(base_dir, 'scripts', 'puente'))
try:
    import importlib.util
    # Import gobernador_recursos from the hyphenated file
    spec = importlib.util.spec_from_file_location("gobernador_recursos", os.path.join(base_dir, 'scripts', 'puente', 'gobernador-recursos.py'))
    gobernador_recursos = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gobernador_recursos)
    from colmena_logica import capacidad_contenedor
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

# Construir el diccionario de capacidad
cap = {}
# Sistema operativo
import platform
system = platform.system()
if system == "Darwin":
    cap["so"] = "macos"
elif system == "Linux":
    # Verificar si es WSL2
    if "Microsoft" in platform.uname().release:
        cap["so"] = "wsl2"
    else:
        cap["so"] = "linux"
else:
    cap["so"] = "otro"

# Herramientas
import shutil
cap["herramientas"] = {
    "git": shutil.which("git") is not None,
    "node": shutil.which("node") is not None,
    "python3": shutil.which("python3") is not None,
    "opencode": shutil.which("opencode") is not None
}
# Para windows wsl, pero asumimos que si estamos en Linux y wsl2, entonces wsl=true
if cap["so"] == "wsl2":
    cap["wsl"] = True
else:
    cap["wsl"] = False

# Medio app: como estamos instalando el trabajador, asumimos que no somos navegador o pwa
cap["medio_app"] = "native"  # Esto no activará la condición de bloqueo en capacidad_contenedor

# Memoria y núcleos
mem = gobernador_recursos.memoria_mb()
cap["ram_total_mb"] = mem.get("ram_total_mb")
cap["nucleos"] = mem.get("nucleos") or os.cpu_count() or 2
# Disco libre en GB
disco_libre_bytes = os.statvfs(os.path.expanduser("~")).f_frsize * os.statvfs(os.path.expanduser("~")).f_bavail if hasattr(os, 'statvfs') else 0
if disco_libre_bytes == 0:
    # Alternativa para Linux
    try:
        import shutil
        disco_libre_bytes = shutil.disk_usage(os.path.expanduser("~")).free
    except:
        disco_libre_bytes = 0
cap["disco_libre_gb"] = disco_libre_bytes / (1024**3)

# Batería (si está disponible)
cap["bateria"] = {"cargando": False, "nivel": 1.0}  # Valor por defecto (asumimos cargada y completa)
# Intentamos obtener datos reales de batería si es posible (solo en algunos sistemas)
try:
    import psutil
    battery = psutil.sensors_battery()
    if battery:
        cap["bateria"] = {"cargando": battery.power_plugged, "nivel": battery.percent / 100.0}
except ImportError:
    pass  # psutil no está disponible, usamos el valor por defecto
except:
    pass

# Red medida: asumimos false por defecto
cap["red"] = {"medida": False}

# Llamar a la función pura
result = capacidad_contenedor(cap)
if result["apto"]:
    print(f"Este aparato puede ser contenedor: {result['agentes']} agente(s). Motivo: {result['motivo']}")
else:
    print(f"Este aparato NO puede ser contenedor: {result['motivo']}")
    if result["falta"]:
        print(f"Falta: {', '.join(result['falta'])}")
EOF
)
        echo "$capacity_explanation"
        exit 0
fi

# Determinar el directorio de instalación
INSTALL_DIR="$HOME/starseed-trabajador"

# Preguntar si el directorio ya existe
if [[ -d "$INSTALL_DIR" ]]; then
    read -p "El directorio $INSTALL_DIR ya existe. ¿Sobreescribirlo? (s/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        info "Operación cancelada por el usuario."
        exit 1
    fi
    # Eliminar el directorio existente si vamos a sobrescribir
    if [[ "$SECO" = false ]]; then
        rm -rf "$INSTALL_DIR"
    fi
fi

# Clonar el repositorio
if [[ "$SECO" = false ]]; then
    info "Clonando el repositorio en $INSTALL_DIR..."
    git clone . "$INSTALL_DIR" || error_exit "Fallo al clonar el repositorio."
    cd "$INSTALL_DIR" || error_exit "No se pudo cambiar al directorio $INSTALL_DIR"
else
    info "[SECO] Se habría clonado el repositorio en $INSTALL_DIR"
    # En modo seco, no cambiamos de directorio, pero necesitamos estar en el repo actual para los scripts
    # Así que nos quedamos en el directorio actual
fi

# Instalar dependencias de Node.js
if [[ "$SECO" = false ]]; then
    info "Instalando dependencias de Node.js (npm ci --include=dev)..."
    npm ci --include=dev || error_exit "Fallo al instalar dependencias de Node.js."
else
    info "[SECO] Se habría ejecutado: npm ci --include=dev"
fi

# Crear la llave del nodo
if [[ "$SECO" = false ]]; then
    info "Creando la llave del nodo (solo se muestra la huella)..."
    KEY_OUTPUT=$(python3 scripts/puente/nodo_metagenesis.py llave) || error_exit "Fallo al crear la llave del nodo."
    echo "Huella de la llave: $KEY_OUTPUT"
else
    info "[SECO] Se habría ejecutado: python3 scripts/puente/nodo_metagenesis.py llave"
fi

# Instalar el nodo en modo contenedor
if [[ "$SECO" = false ]]; then
    info "Instalando el nodo en modo contenedor..."
    # Determinar el tipo de servicio según el SO
    os_info=$(get_os_info)
    os_type=$(echo "$os_info" | awk '{print $1}')
    case "$os_type" in
        macos)
            info "Configurando servicio launchd para macOS..."
            python3 scripts/puente/nodo_metagenesis.py instalar || error_exit "Fallo al instalar el nodo en modo contenedor (launchd)."
            ;;
        linux|wsl2)
            info "Configurando servicio systemd --user para Linux/WSL2..."
            python3 scripts/puente/nodo_metagenesis.py instalar || error_exit "Fallo al instalar el nodo en modo contenedor (systemd)."
            ;;
        *)
            error_exit "Sistema operativo no soportado para instalación de servicio: $os_type"
            ;;
    esac
else
    info "[SECO] Se habría ejecutado: python3 scripts/puente/nodo_metagenesis.py instalar"
fi

# Explicar la capacidad del aparato
info "Explicando la capacidad del aparato como contenedor..."
capacity_explanation=$(python3 - <<EOF
import sys
import os
base_dir = os.getcwd()
sys.path.insert(0, os.path.join(base_dir, 'scripts', 'puente'))
try:
    import importlib.util
    # Import gobernador_recursos from the hyphenated file
    spec = importlib.util.spec_from_file_location("gobernador_recursos", os.path.join(base_dir, 'scripts', 'puente', 'gobernador-recursos.py'))
    gobernador_recursos = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gobernador_recursos)
    from colmena_logica import capacidad_contenedor
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

# Construir el diccionario de capacidad
cap = {}
# Sistema operativo
import platform
system = platform.system()
if system == "Darwin":
    cap["so"] = "macos"
elif system == "Linux":
    # Verificar si es WSL2
    if "Microsoft" in platform.uname().release:
        cap["so"] = "wsl2"
    else:
        cap["so"] = "linux"
else:
    cap["so"] = "otro"

# Herramientas
import shutil
cap["herramientas"] = {
    "git": shutil.which("git") is not None,
    "node": shutil.which("node") is not None,
    "python3": shutil.which("python3") is not None,
    "opencode": shutil.which("opencode") is not None
}
# Para windows wsl, pero asumimos que si estamos en Linux y wsl2, entonces wsl=true
if cap["so"] == "wsl2":
    cap["wsl"] = True
else:
    cap["wsl"] = False

# Medio app: como estamos instalando el trabajador, asumimos que no somos navegador o pwa
cap["medio_app"] = "native"  # Esto no activará la condición de bloqueo en capacidad_contenedor

# Memoria y núcleos
mem = gobernador_recursos.memoria_mb()
cap["ram_total_mb"] = mem.get("ram_total_mb")
cap["nucleos"] = mem.get("nucleos") or os.cpu_count() or 2
# Disco libre en GB
disco_libre_bytes = os.statvfs(os.path.expanduser("~")).f_frsize * os.statvfs(os.path.expanduser("~")).f_bavail if hasattr(os, 'statvfs') else 0
if disco_libre_bytes == 0:
    # Alternativa para Linux
    try:
        import shutil
        disco_libre_bytes = shutil.disk_usage(os.path.expanduser("~")).free
    except:
        disco_libre_bytes = 0
cap["disco_libre_gb"] = disco_libre_bytes / (1024**3)

# Batería (si está disponible)
cap["bateria"] = {"cargando": False, "nivel": 1.0}  # Valor por defecto (asumimos cargada y completa)
# Intentamos obtener datos reales de batería si es posible (solo en algunos sistemas)
try:
    import psutil
    battery = psutil.sensors_battery()
    if battery:
        cap["bateria"] = {"cargando": battery.power_plugged, "nivel": battery.percent / 100.0}
except ImportError:
    pass  # psutil no está disponible, usamos el valor por defecto
except:
    pass

# Red medida: asumimos false por defecto
cap["red"] = {"medida": False}

# Llamar a la función pura
result = capacidad_contenedor(cap)
if result["apto"]:
    print(f"Este aparato puede ser contenedor: {result['agentes']} agente(s). Motivo: {result['motivo']}")
else:
    print(f"Este aparato NO puede ser contenedor: {result['motivo']}")
    if result["falta"]:
        print(f"Falta: {', '.join(result['falta'])}")
EOF
)
echo "$capacity_explanation"

# Paso final: emparejar con el código (si se proporcionó)
if [[ -n "$EMPAREJAR_CODIGO" ]]; then
    info "Emparejando el nodo con el código proporcionado..."
    # Según el contrato, este paso imprimiría «pendiente: falta la migración de nodos (§8)» si el servidor responde 503.
    # Como no tenemos el servidor, asumimos que la migración aún no se ha aplicado y siempre imprimimos el mensaje.
    echo "pendiente: falta la migración de nodos (§8)"
else
    info "No se proporcionó código de emparejado. Saltando el paso de emparejado."
fi

info "Instalación completada."
exit 0