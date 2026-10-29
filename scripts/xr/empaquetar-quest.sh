#!/bin/bash

# Script de empaquetado para Quest (Meta Quest PWA packaging)
# Lee variables de entorno. Uso: STARSEED_QUEST_PACKAGE=... ./scripts/xr/empaquetar-quest.sh

set -e

if [[ "$1" == "--ayuda" ]]; then
    echo "Uso: STARSEED_QUEST_PACKAGE=<nombre> bash scripts/xr/empaquetar-quest.sh"
    exit 0
fi

if [[ -z "$STARSEED_QUEST_PACKAGE" ]]; then
    echo "Error: STARSEED_QUEST_PACKAGE no definida"
    exit 2
fi

# Configuración por defecto
MANIFEST_URL="${STARSEED_QUEST_MANIFEST_URL:-https://starseed-os.vercel.app/manifest.webmanifest}"
MODE="${STARSEED_QUEST_MODE:-immersive}"

# Comprobar Node >= 18
NODE_VERSION=$(node -v | cut -d. -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node >= 18 requerido"
    exit 1
fi

# Instalar bubblewrap si falta (1.24.1)
if ! command -v bubblewrap &> /dev/null; then
    npm install -g @meta-quest/bubblewrap-cli@1.24.1
fi

# Iniciar bubblewrap
bubblewrap init --manifest="$MANIFEST_URL" --metaquest

# Obtener SHA-256 de keystore
if [[ -n "$STARSEED_QUEST_KEYSTORE" ]]; then
    echo "SHA-256 fingerprint (usar para bubblewrap):"
    keytool -list -v -keystore "$STARSEED_QUEST_KEYSTORE" -alias android
fi

# Añadir fingerprint
if [[ -n "$STARSEED_QUEST_SHA256" ]]; then
    bubblewrap fingerprint add "$STARSEED_QUEST_SHA256"
fi

# Build
bubblewrap build

# Instalar si hay visor
if command -v adb &> /dev/null && adb devices | grep -q "device$"; then
    adb install "$STARSEED_QUEST_PACKAGE".apk
fi

echo "Nota: Asegúrate de servir /.well-known/assetlinks.json para el modo inmersivo."
