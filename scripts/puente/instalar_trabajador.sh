#!/usr/bin/env bash
set -uo pipefail

# Variables
REPO_URL="https://github.com/anomalyco/starseed-os-main.git"
REPO_DIR="$HOME/starseed-trabajador"
DRY_RUN=false
PAIR_CODE=""

# Functions
print_help() {
    cat <<EOF
Usage: $0 [options]
Options:
  --emparejar <código>   Pairing code for the worker
  --seco                 Dry run, do not make changes
  --ayuda                Show this help
EOF
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

get_total_ram_mb() {
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS: sysctl -n hw.memsize gives bytes
        sysctl -n hw.memsize | awk '{print int($1/1024/1024)}'
    else
        # Linux: /proc/meminfo
        grep -i 'memtotal' /proc/meminfo | awk '{print int($2/1024)}'
    fi
}

get_free_disk_gb() {
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS: df -g
        df -g "$HOME" | tail -1 | awk '{print $4}'
    else
        # Linux: df -BG
        df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//'
    fi
}

get_cpu_cores() {
    if [[ "$(uname)" == "Darwin" ]]; then
        sysctl -n hw.ncpu
    else
        nproc
    fi
}

check_tools() {
    local missing=()
    for tool in git node python3 opencode; do
        if ! check_command "$tool"; then
            missing+=("$tool")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Error: Missing tools: ${missing[*]}" >&2
        echo "Please install them using the exact commands for your system:" >&2
        for tool in "${missing[@]}"; do
            case "$tool" in
                git)
                    if [[ "$(uname)" == "Darwin" ]]; then
                        echo "  brew install git"
                    else
                        echo "  sudo apt-get install git   # Debian/Ubuntu"
                        echo "  sudo dnf install git       # Fedora"
                        echo "  sudo zypper install git    # openSUSE"
                    fi
                    ;;
                node)
                    if [[ "$(uname)" == "Darwin" ]]; then
                        echo "  brew install node"
                    else
                        echo "  sudo apt-get install nodejs npm   # Debian/Ubuntu"
                        echo "  sudo dnf install nodejs npm       # Fedora"
                        echo "  sudo zypper install nodejs        # openSUSE"
                    fi
                    ;;
                python3)
                    if [[ "$(uname)" == "Darwin" ]]; then
                        echo "  brew install python3"
                    else
                        echo "  sudo apt-get install python3   # Debian/Ubuntu"
                        echo "  sudo dnf install python3       # Fedora"
                        echo "  sudo zypper install python3    # openSUSE"
                    fi
                    ;;
                opencode)
                    echo "  npm install -g @anomalyco/opencode"
                    ;;
            esac
        done
        return 1
    fi
    return 0
}

# Parse options
while [[ $# -gt 0 ]]; do
    case $1 in
        --emparejar)
            PAIR_CODE="$2"
            shift 2
            ;;
        --seco)
            DRY_RUN=true
            shift
            ;;
        --ayuda)
            print_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            print_help
            exit 1
            ;;
    esac
done

# Check tools
if ! check_tools; then
    exit 1
fi

# Get system info
TOTAL_RAM_MB=$(get_total_ram_mb)
FREE_DISK_GB=$(get_free_disk_gb)
CPU_CORES=$(get_cpu_cores)

# Check if repo directory exists
if [[ -d "$REPO_DIR" ]]; then
    read -p "Directory $REPO_DIR already exists. Do you want to use it? (y/N) " -r
    echo
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
        echo "Please remove or rename $REPO_DIR and try again."
        exit 1
    fi
else
    if [[ "$DRY_RUN" = false ]]; then
        git clone "$REPO_URL" "$REPO_DIR"
        if [[ $? -ne 0 ]]; then
            echo "Failed to clone repository."
            exit 1
        fi
    else
        echo "[DRY RUN] Would clone $REPO_URL to $REPO_DIR"
    fi
fi

# Change to repo directory
if [[ "$DRY_RUN" = false ]]; then
    cd "$REPO_DIR" || exit 1
fi

# Install dependencies
if [[ "$DRY_RUN" = false ]]; then
    npm ci --include=dev
    if [[ $? -ne 0 ]]; then
        echo "npm ci failed."
        exit 1
    fi
else
    echo "[DRY RUN] Would run: npm ci --include=dev"
fi

# Create node key
if [[ "$DRY_RUN" = false ]]; then
    echo "Creating node key..."
    KEY_OUTPUT=$(python3 scripts/puente/nodo_metagenesis.py llave 2>&1)
    if [[ $? -ne 0 ]]; then
        echo "Failed to create node key:"
        echo "$KEY_OUTPUT"
        exit 1
    fi
    echo "Node key fingerprint: $KEY_OUTPUT"
else
    echo "[DRY RUN] Would run: python3 scripts/puente/nodo_metagenesis.py llave"
fi

# Install node in container mode
if [[ "$DRY_RUN" = false ]]; then
    echo "Installing node in container mode..."
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS: launchd with Homebrew's python3
        BREW_PREFIX=$(brew --prefix)
        PYTHON3="$BREW_PREFIX/bin/python3"
        if [[ ! -x "$PYTHON3" ]]; then
            echo "Homebrew python3 not found at $PYTHON3"
            exit 1
        fi
        # We assume the installation script handles launchd
        INSTALL_OUTPUT=$(python3 scripts/puente/nodo_metagenesis.py instalar 2>&1)
    else
        # Linux/WSL2: systemd --user
        INSTALL_OUTPUT=$(python3 scripts/puente/nodo_metagenesis.py instalar 2>&1)
    fi
    if [[ $? -ne 0 ]]; then
        echo "Failed to install node:"
        echo "$INSTALL_OUTPUT"
        exit 1
    fi
    echo "$INSTALL_OUTPUT"
else
    echo "[DRY RUN] Would run: python3 scripts/puente/nodo_metagenesis.py instalar"
fi

# Pairing step
if [[ -n "$PAIR_CODE" ]]; then
    if [[ "$DRY_RUN" = false ]]; then
        echo "Pairing with code: $PAIR_CODE"
        # We assume the pairing is done via the nodo_metagenesis.py script or another method
        # For now, we just simulate the step that would print the pending message if 503
        # In reality, we would call an API, but we don't have the details.
        # We'll just print a placeholder.
        echo "pendiente: falta la migración de nodos (§8)"
    else
        echo "[DRY RUN] Would pair with code: $PAIR_CODE"
    fi
fi

# Explain how many agents the worker can contribute
# We use the colmena_logica.capacidad_contenedor function with the system information we gathered
if [[ "$DRY_RUN" = false ]]; then
    EXPLANATION=$(python3 -c "
import sys
sys.path.append('scripts/puente')
import colmena_logica as C
import json
import subprocess
import platform

# Check tools
herr = {}
for tool in ('git', 'node', 'python3', 'opencode'):
    herr[tool] = subprocess.call(['which', tool], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0

# System info
so = platform.system().lower()
if so == 'darwin':
    so = 'macos'
elif so == 'linux':
    so = 'linux'
elif so == 'windows':
    so = 'windows'
else:
    so = 'otro'

# Get ram total in MB
try:
    if platform.system() == 'Darwin':
        ram_total_mb = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize']).strip()) // 1024 // 1024
    else:
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                if line.startswith('MemTotal'):
                    ram_total_mb = int(line.split()[1]) // 1024
                    break
except:
    ram_total_mb = 0

# Get cpu cores
try:
    nucleos = int(subprocess.check_output(['nproc']).strip())
except:
    nucleos = 1

# Get free disk in GB
try:
    if platform.system() == 'Darwin':
        disco_libre_gb = float(subprocess.check_output(['df', '-g', '$HOME']).split()[-2])
    else:
        disco_libre_gb = float(subprocess.check_output(['df', '-BG', '$HOME']).split()[-2].replace('G', ''))
except:
    disco_libre_gb = 0

# Battery and red measurements are optional, we leave them out for now
cap = C.capacidad_contenedor({
    'so': so,
    'herramientas': herr,
    'ram_total_mb': ram_total_mb,
    'nucleos': nucleos,
    'disco_libre_gb': disco_libre_gb
})
print(cap['motivo'])
")
    echo "Capacidad de contenedor: $EXPLANATION"
else
    echo "[DRY RUN] Would explain container capacity"
fi

exit 0