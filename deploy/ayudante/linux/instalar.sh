#!/usr/bin/env bash

# Instalador del ayudante StarSeed
set -e

INSTALL_DIR="/usr/local/sbin"
HELPER_NAME="starseed-ayudante"
TARGET="$INSTALL_DIR/$HELPER_NAME"

echo "Instalando $HELPER_NAME en $INSTALL_DIR..."

# Copiar el binario
cp "deploy/ayudante/linux/$HELPER_NAME" "$TARGET"
chmod 755 "$TARGET"

# Configurar sudoers (simulado para prueba)
# echo "starseed ALL=(root) NOPASSWD: $TARGET" > /etc/sudoers.d/starseed-ayudante
# chmod 0440 /etc/sudoers.d/starseed-ayudante

echo "Instalación completada."
