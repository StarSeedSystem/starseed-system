#!/usr/bin/env bash
set -euo pipefail

# Variables
USER="starseed"
HOME_DIR="/home/${USER}"
OIDO_DIR="${HOME_DIR}/oido"
VENV_DIR="${OIDO_DIR}/venv"
SERVICE_FILE="/etc/systemd/system/starseed-oido.service"
ENV_FILE="${OIDO_DIR}/.env"

# Ensure we are running as root or can sudo
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root or with sudo"
   exit 1
fi

# Function to create directories and set permissions
setup_directories() {
    mkdir -p "${OIDO_DIR}"
    chown -R "${USER}:${USER}" "${OIDO_DIR}"
}

# Function to install torch CPU version
install_torch() {
    sudo -u "${USER}" pip install --no-deps torch --index-url https://download.pytorch.org/whl/cpu
}

# Function to install fermion-research
install_fermion() {
    sudo -u "${USER}" pip install fermion-research
}

# Function to create virtual environment
create_venv() {
    sudo -u "${USER}" python3 -m venv "${VENV_DIR}"
    sudo -u "${USER}" "${VENV_DIR}/bin/pip" install --upgrade pip
}

# Main installation
main() {
    setup_directories
    create_venv
    install_torch
    install_fermion
    # Create environment file for API key (to be filled later)
    if [[ ! -f "${ENV_FILE}" ]]; then
        echo "OIDO_CLAVE=" > "${ENV_FILE}"
        chmod 600 "${ENV_FILE}"
        chown "${USER}:${USER}" "${ENV_FILE}"
    fi
    # Copy service file
    cp deploy/oracle/nodo/oido/starseed-oido.service "${SERVICE_FILE}"
    systemctl daemon-reload
    systemctl enable starseed-oido.service
    echo "Installation complete. Please set the API key in ${ENV_FILE} and start the service."
}

main "$@"