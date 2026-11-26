#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
#
# Idempotencia (PRD1005Tbsb): cada flujo recibe un `id` estable derivado de su
# nombre de archivo. n8n hace upsert por `id`, así que reimportar actualiza el
# flujo en sitio en vez de crear una copia nueva. La importación va UNA vez por
# directorio porque `--separate` de n8n exige un directorio, no un archivo.
set -eu

FLUJOS="${FLUJOS:-/opt/flujos}"
DESTINO_TMP="${DESTINO_TMP:-/tmp/n8n-flujos}"

# Id estable: los mismos archivos producen siempre los mismos ids.
id_estable() {
  printf 'starseed-%s' "$(basename "$1" .json)"
}

# Copia el flujo a $2 añadiendo un `id` estable si no lo trae. No toca el original.
normalizar_flujo() {
  node -e '
    const fs = require("fs");
    const [entrada, salida, id] = process.argv.slice(1);
    const flujo = JSON.parse(fs.readFileSync(entrada, "utf8"));
    if (!flujo.id) flujo.id = id;
    fs.writeFileSync(salida, JSON.stringify(flujo));
  ' "$1" "$2" "$(id_estable "$1")"
}

# Prepara todos los flujos válidos en un solo directorio temporal.
preparar_flujos() {
  rm -rf "$DESTINO_TMP"
  mkdir -p "$DESTINO_TMP"
  for f in "$FLUJOS"/*.json; do
    [ -f "$f" ] || continue
    destino="$DESTINO_TMP/$(basename "$f")"
    if ! normalizar_flujo "$f" "$destino"; then
      rm -f "$destino"
      echo "aviso: flujo inválido $f (no se importa para no duplicar)" >&2
    fi
  done
}

importar_flujos() {
  preparar_flujos
  # Una sola importación por directorio: n8n actualiza por `id`.
  n8n import:workflow --separate --input="$DESTINO_TMP" || echo "aviso: importación fallida" >&2
}

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
activar_flujos() {
  for id in $(n8n list:workflow --onlyId 2>/dev/null || true); do
    n8n update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
  done
}

# Permite cargar las funciones en las pruebas sin arrancar n8n.
if [ "${ARRANQUE_SOLO_FUNCIONES:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

importar_flujos
activar_flujos
exec n8n start
