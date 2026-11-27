#!/bin/bash
# Instalación del ayudante con privilegios de Linux
# Parte 1 de 2 de TRM1125C-d1 (terminal-neuronas-1125)
# Ejecutar como root o con sudo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AYUDANTE_SRC="${SCRIPT_DIR}/starseed-ayudante"
AYUDANTE_DST="/usr/local/bin/starseed-ayudante"
SUDOERS_SRC="${SCRIPT_DIR}/starseed-ayudante.sudoers"
SUDOERS_DST="/etc/sudoers.d/starseed-ayudante"
COOKIES_DIR="${HOME}/.local/share/starseed/ayudante"

echo "Instalando starseed-ayudante con privilegios..."

if [[ ! -f "${AYUDANTE_SRC}" ]]; then
    echo "ERROR: No se encuentra starseed-ayudante en ${SCRIPT_DIR}" >&2
    exit 1
fi

if [[ ! -f "${SUDOERS_SRC}" ]]; then
    echo "ERROR: No se encuentra archivo sudoers en ${SCRIPT_DIR}" >&2
    exit 1
fi

cp "${AYUDANTE_SRC}" "${AYUDANTE_DST}"
chmod 755 "${AYUDANTE_DST}"

cp "${SUDOERS_SRC}" "${SUDOERS_DST}"
chmod 440 "${SUDOERS_DST}"

echo "Verificando configuración sudoers..."
if ! visudo -c -f "${SUDOERS_DST}" > /dev/null 2>&1; then
    echo "ERROR: configuración sudoers inválida" >&2
    cat "${SUDOERS_DST}"
    rm -f "${SUDOERS_DST}"
    rm -f "${AYUDANTE_DST}"
    exit 1
fi

mkdir -p "${COOKIES_DIR}"
chmod 700 "${COOKIES_DIR}"
touch "${COOKIES_DIR}/.token-sesion"
chmod 600 "${COOKIES_DIR}/.token-sesion"

echo "Actualizando base de datos de comandos..."
hash -r 2>/dev/null || true

echo ""
echo "Instalación completada."
echo "Ejecutable: ${AYUDANTE_DST}"
echo "Regla sudoers: ${SUDOERS_DST}"
echo ""
echo "Para probar (como usuario no-root):"
echo "  ${AYUDANTE_DST} ayuda"
echo "  ${AYUDANTE_DST} --test"
echo ""
echo "Para instalar sudo rule (requiere sudo):"
echo "  sudo visudo -c -f ${SUDOERS_DST}"