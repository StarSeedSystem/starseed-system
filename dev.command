#!/bin/bash
# Doble-clica este archivo para arrancar el servidor de desarrollo de StarSeed.
# Se abrirá en http://localhost:9002

cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "  🌌  StarSeed Network — dev server"
echo "  -------------------------------------------"
echo "  URL local:  http://localhost:9002"
echo "  Para parar: Ctrl+C"
echo ""

# Si yarn está instalado preferimos yarn; si no, npm.
if command -v yarn >/dev/null 2>&1; then
  exec yarn dev
else
  exec npm run dev
fi
