#!/usr/bin/env bash
set -uo pipefail

# Instalador del trabajador para cualquier aparato (Linux, macOS, WSL2)
# Uso: ./instalar_trabajador.sh [--emparejar <código>] [--seco] [--ayuda]

RAIZ="${STARSEED_ROOT:-$(pwd)}"
SECO=false
EMPAREJAR_CODIGO=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --emparejar)
      if [[ -z "$2" ]]; then
        echo "Error: --emparejar requiere un argumento" >&2
        exit 1
      fi
      EMPAREJAR_CODIGO="$2"
      shift 2
      ;;
    --seco)
      SECO=true
      shift
      ;;
    --ayuda|-h)
      echo "Uso: $0 [--emparejar <código>] [--seco] [--ayuda]"
      echo ""
      echo "Opciones:"
      echo "  --emparejar <código>   Código de emparejado de 6-20 caracteres alfanuméricos"
      echo "  --seco                 Modo seco: no instala nada, solo muestra qué haría"
      echo "  --ayuda                Muestra esta ayuda"
      exit 0
      ;;
    *)
      echo "Error: opción desconocida: $1" >&2
      exit 1
      ;;
  esac
done

# Funciones
function log() {
  echo "[instalar_trabajador] $*"
}

function error() {
  log "ERROR: $*" >&2
  exit 1
}

function version_ge() {
  # Devuelve 0 si $1 >= $2, 1 en caso contrario, usando sort -V
  local v1="$1"
  local v2="$2"
  # Usamos sort -V para ordenar versiones; la primera línea es la menor
  local menor
  menor=$(printf "%s\n%s\n" "$v1" "$v2" | sort -V | head -n1)
  if [[ "$menor" == "$v2" ]]; then
    # v2 es la menor, así que v1 >= v2
    return 0
  else
    # v1 es la menor (o igual), así que v1 < v2
    return 1
  fi
}

function dar_comando_instalacion() {
  local herramienta="$1"
  local sistema="$2"
  # Esta función debería devolver el comando exacto para instalar la herramienta en el sistema
  # Por simplicidad, devolvemos un genérico; en una implementación completa, se detectaría el gestor de paquetes
  case "$sistema" in
    macos)
      case "$herramienta" in
        git) echo "brew install git" ;;
        node) echo "brew install node" ;;
        python3) echo "brew install python" ;;
        opencode) echo "npm install -g opencode" ;; # Asumimos que se instala con npm
        *) echo "No se conoce el comando para instalar $herramienta en macos" ;;
      esac
      ;;
    linux)
      # Detectar gestor de paquetes
      if command -v apt-get >/dev/null 2>&1; then
        case "$herramienta" in
          git) echo "sudo apt-get update && sudo apt-get install -y git" ;;
          node) echo "sudo apt-get update && sudo apt-get install -y nodejs npm" ;;
          python3) echo "sudo apt-get update && sudo apt-get install -y python3" ;;
          opencode) echo "npm install -g opencode" ;;
          *) echo "No se conoce el comando para instalar $herramienta en linux (apt)" ;;
        esac
      elif command -v dnf >/dev/null 2>&1; then
        case "$herramienta" in
          git) echo "sudo dnf install -y git" ;;
          node) echo "sudo dnf install -y nodejs npm" ;;
          python3) echo "sudo dnf install -y python3" ;;
          opencode) echo "npm install -g opencode" ;;
          *) echo "No se conoce el comando para instalar $herramienta en linux (dnf)" ;;
        esac
      else
        case "$herramienta" in
          git) echo "Instale git mediante su gestor de paquetes" ;;
          node) echo "Instale nodejs y npm mediante su gestor de paquetes" ;;
          python3) echo "Instale python3 mediante su gestor de paquetes" ;;
          opencode) echo "Instale opencode mediante npm: npm install -g opencode" ;;
          *) echo "No se conoce el comando para instalar $herramienta" ;;
        esac
      fi
      ;;
    *)
      echo "Sistema no soportado para detección automática de gestor de paquetes"
      ;;
  esac
}

function comprobar_herramienta() {
  local nombre="$1"
  local min_version="$2"
  local comando_version="$3"
  local sistema="$4"  # macos o linux

  if ! command -v "$nombre" >/dev/null 2>&1; then
    local cmd_inst
    cmd_inst=$(dar_comando_instalacion "$nombre" "$sistema")
    error "No se encuentra '$nombre'. Instálelo con: $cmd_inst"
  fi

  if [[ -n "$min_version" && -n "$comando_version" ]]; then
    local version_raw
    version_raw=$($comando_version 2>/dev/null | head -n1) || error "No se pudo obtener la versión de '$nombre'"
    if ! version_ge "$version_raw" "$min_version"; then
      error "Se requiere '$nombre' versión ≥ $min_version, pero se encontró $version_raw. Instálelo con: $(dar_comando_instalacion "$nombre" "$sistema")"
    fi
  fi
}

# Determinar el sistema operativo
SO="$(uname -s)"
case "$SO" in
  Darwin) SO_SISTEMA="macos" ;;
  Linux)  SO_SISTEMA="linux" ;;
  *)      error "Sistema operativo no soportado: $SO" ;;
esac

log "Sistema operativo detectado: $SO"

# Comprobar herramientas necesarias
log "Comprobando herramientas necesarias..."
comprobar_herramienta "git" "" "" "$SO_SISTEMA"
comprobar_herramienta "node" "20.19" "node --version" "$SO_SISTEMA"
comprobar_herramienta "python3" "3.9" "python3 --version" "$SO_SISTEMA"
comprobar_herramienta "opencode" "" "" "$SO_SISTEMA"

# Si estamos en modo seco, salir después de comprobar las herramientas y antes de hacer cambios
if [[ "$SECO" == true ]]; then
  log "Modo seco: comprobación de herramientas completada. Saliendo sin hacer cambios."
  exit 0
fi

# Directorio de instalación
INSTALL_DIR="$HOME/starseed-trabajador"
if [[ -d "$INSTALL_DIR" ]]; then
  read -p "El directorio $INSTALL_DIR ya existe. ¿¿Sobrescribir? (s/N) " -n 1 -r
  echo
  if [[ ! "$REPLY" =~ ^[Ss]$ ]]; then
    log "Instalación cancelada."
    exit 1
  fi
  rm -rf "$INSTALL_DIR"
fi

# Clonar el repositorio
log "Clonando el repositorio en $INSTALL_DIR..."
git clone "$RAIZ" "$INSTALL_DIR" || error "Fallo al clonar el repositorio"
cd "$INSTALL_DIR"

# Explicar cuántos agentes podrá aportar
log "Calculando capacidad de contenedor..."
# Obtener información del sistema
if [[ "$SO_SISTEMA" == "linux" ]]; then
  RAM_TOTAL_MB=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
  NUCLEOS=$(nproc)
  DISCO_LIBRE_GB=$(df -BG "$HOME" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')
  if [[ -z "$DISCO_LIBRE_GB" ]]; then
    DISCO_LIBRE_GB=$(df -k "$HOME" | awk 'NR==2 {printf "%.0f", $4/1024/1024}')
  fi
elif [[ "$SO_SISTEMA" == "macos" ]]; then
  RAM_TOTAL_MB=$(sysctl -n hw.memsize | awk '{printf "%.0f", $0/1024/1024}')
  NUCLEOS=$(sysctl -n hw.ncpu)
  DISCO_LIBRE_GB=$(df -g "$HOME" | awk 'NR==2 {print $4}')
fi

# Valores por defecto si fallan las detecciones
RAM_TOTAL_MB=${RAM_TOTAL_MB:-0}
NUCLEOS=${NUCLEOS:-1}
DISCO_LIBRE_GB=${DISCO_LIBRE_GB:-0}

# Llamar a un script de Python para calcular la capacidad
CAPACIDAD_JSON=$(python3 -c "
import json
import sys
sys.path.insert(0, '$RAIZ/scripts/puente')
from colmena_logica import capacidad_contenedor
cap = {
    'so': '$SO_SISTEMA',
    'herramientas': {
        'git': True,
        'node': True,
        'python3': True,
        'opencode': True
    },
    'ram_total_mb': $RAM_TOTAL_MB,
    'nucleos': $NUCLEOS,
    'disco_libre_gb': $DISCO_LIBRE_GB,
    'bateria': {'cargando': False, 'nivel': 1.0},
    'red': {'medida': False}
}
result = capacidad_contenedor(cap)
print(json.dumps(result))
")
echo "$CAPACIDAD_JSON" | python3 -m json.tool 2>/dev/null || echo "$CAPACIDAD_JSON"

# Instalar dependencias
log "Instalando dependencias con npm ci --include=dev..."
npm ci --include=dev || error "Fallo al instalar dependencias"

# Crear la llave del nodo
log "Creando la llave del nodo..."
python3 "$RAIZ/scripts/puente/nodo_metagenesis.py" llave || error "Fallo al crear la llave del nodo"

# Instalar el nodo en modo contenedor
log "Instalando el nodo en modo contenedor..."
python3 "$RAIZ/scripts/puente/nodo_metagenesis.py" instalar || error "Fallo al instalar el nodo"

# Emparejado con el código
if [[ -n "$EMPAREJAR_CODIGO" ]]; then
  log "Emparejando con el código: $EMPAREJAR_CODIGO"
  # Simular una llamada que podría fallar con 503
  echo "pendiente: falta la migración de nodos (§8)"
fi

log "Instalación completada."
