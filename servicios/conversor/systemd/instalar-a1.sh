#!/usr/bin/env bash
set -euo pipefail

FILEE_VER="2.0.0"
FILEE_ARCH="linux-arm64"
FILEE_TAR="Filee-${FILEE_VER}-${FILEE_ARCH}.tar.gz"
FILEE_SUMS="Filee-${FILEE_VER}-${FILEE_ARCH}-SHA256SUMS.txt"
FILEE_URL="https://github.com/KnifeLemon/Filee/releases/download/v${FILEE_VER}/${FILEE_TAR}"
FILEE_SUMS_URL="https://github.com/KnifeLemon/Filee/releases/download/v${FILEE_VER}/${FILEE_SUMS}"
INSTALL_DIR="${HOME}/.starseed/conversor"
BIN_DIR="${HOME}/.local/bin"
SERVICE_FILE="${HOME}/.config/systemd/user/starseed-conversor.service"
ENV_FILE="${HOME}/.starseed/conversor.env"

mkdir -p "$(cd "$(dirname "$0")" && pwd)"

echo "=== Descargando Filee ${FILEE_VER} para ARM64 ==="
cd /tmp
curl -fL "${FILEE_URL}" -o "${FILEE_TAR}"

echo "=== Verificando SHA-256 ==="
SUMS_CONTENT=$(curl -sL "${FILEE_SUMS_URL}")
EXPECTED=$(echo "${SUMS_CONTENT}" | grep "${FILEE_TAR}" | awk '{print $1}')
ACTUAL=$(sha256sum "${FILEE_TAR}" | awk '{print $1}')

if [ "${EXPECTED}" != "${ACTUAL}" ]; then
    echo "ERROR: SHA-256 mismatch. Esperado: ${EXPECTED}, Obtenido: ${ACTUAL}"
    exit 1
fi

echo "=== Extrayendo Filee ==="
tar -xzf "${FILEE_TAR}"

echo "=== Ejecutando install.sh sin root ==="
cd "Filee-${FILEE_VER}-${FILEE_ARCH}"
./install.sh || true

echo "=== Desactivando telemetría ==="
if [ -f "./telemetry.sh" ]; then
    ./telemetry.sh off || true
fi
if [ -f "./set-telemetry.sh" ]; then
    ./set-telemetry.sh off || true
fi
if [ -f "telemetry.sh" ]; then
    chmod -x telemetry.sh 2>/dev/null || true
fi

echo "=== Instalando binario ==="
mkdir -p "${BIN_DIR}"
cp -f filee "${BIN_DIR}/filee" || true
chmod +x "${BIN_DIR}/filee" 2>/dev/null || true

echo "=== Configurando servicio systemd de usuario ==="
mkdir -p "${HOME}/.config/systemd/user/"
cat > "${SERVICE_FILE}" << 'SVCEOF'
[Unit]
Description=StarSeed OS Filee Conversor Service
After=network.target

Service
Type=simple
ExecStart=/usr/bin/filee convert %F --to %T -o %O --json --overwrite
EnvironmentFile=-%h/.starseed/conversor.env
WorkingDirectory=%h
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SVCEOF

echo "=== Creando archivo de entorno ==="
mkdir -p "${INSTALL_DIR}"
cat > "${ENV_FILE}" << 'ENVEOF'
# Configuración de entorno para el conversor Filee
# Variables configurables por el usuario
FILEE_QUALITY=80
ENVEOF

echo "=== Recargando systemd ==="
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable starseed-conversor.service 2>/dev/null || true

echo "=== Instalación completada ==="
echo "Filee está en ${BIN_DIR}/filee"
echo "Configuración en ${ENV_FILE}"
echo "Servicio systemd en ${SERVICE_FILE}"