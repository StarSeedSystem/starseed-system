#!/bin/bash
# instalar.sh - Instala el starseed-ayudante en Linux

set -e

# Comprobar sudoers
if ! sudo visudo -c <(echo "starseed ALL=(ALL) NOPASSWD: /usr/local/sbin/starseed-ayudante"); then
    echo "Error: Configuración de sudoers inválida"
    exit 1
fi

# Instalar ayudante
sudo cp deploy/ayudante/linux/starseed-ayudante /usr/local/sbin/starseed-ayudante
sudo chmod 755 /usr/local/sbin/starseed-ayudante

echo "Instalación completada"
