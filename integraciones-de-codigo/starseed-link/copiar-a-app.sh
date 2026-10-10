#!/usr/bin/env bash
# Copia el kit StarSeed Link a una app vinculada (2026-10-10).
#   bash integraciones-de-codigo/starseed-link/copiar-a-app.sh <carpeta del kit en la app>
#   p. ej.  … ~/Documents/omni-frecuencias-holográficas/services/starseed-link
# Copia src/*.ts tal cual y escribe LEEME.md con la versión y la huella sha256 de cada archivo,
# para que cualquiera compruebe que la copia es fiel (`shasum -a 256 -c` sobre esas líneas).
# No toca nada más de la app. Las pruebas del kit viven en el OS, no en la copia.
set -euo pipefail
origen="$(cd "$(dirname "$0")" && pwd)/src"
destino="${1:?Uso: copiar-a-app.sh <carpeta destino del kit dentro de la app>}"
mkdir -p "$destino"
cp "$origen"/*.ts "$destino"/
version=$(sed -n 's/.*VERSION_KIT = "\(.*\)".*/\1/p' "$origen/index.ts")
if command -v sha256sum >/dev/null 2>&1; then suma="sha256sum"; else suma="shasum -a 256"; fi
{
  echo "# StarSeed Link ${version} (copia del kit)"
  echo
  echo "Copia fiel de \`integraciones-de-codigo/starseed-link/src/\` del repo de StarSeed OS"
  echo "(\`StarSeedSystem/starseed-system\`). **No se edita aquí**: se actualiza con"
  echo "\`bash integraciones-de-codigo/starseed-link/copiar-a-app.sh <esta carpeta>\` desde el OS,"
  echo "donde están sus pruebas (también la de compatibilidad con el OS y la de compilar sin «strict»)."
  echo "Contrato: \`architecture/vinculo-apps-starseed-link.md\` del OS."
  echo
  echo "Huellas (comprobar con \`shasum -a 256 -c\` desde esta carpeta):"
  echo
  echo '```'
  (cd "$origen" && $suma *.ts)
  echo '```'
} > "$destino/LEEME.md"
echo "Kit StarSeed Link ${version} copiado en ${destino} ($(ls "$origen"/*.ts | wc -l | tr -d ' ') archivos)."
