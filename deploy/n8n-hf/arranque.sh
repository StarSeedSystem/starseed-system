#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
#
# Idempotente: cada flujo lleva un `id` estable en su JSON y n8n hace upsert por
# id, así que reiniciar ACTUALIZA el flujo en vez de crear una copia nueva. Un
# JSON sin id haría que n8n inventara uno distinto en cada arranque y lo
# duplicara: en ese caso no se importa nada y se avisa.
set -eu

FLUJOS_DIR="${FLUJOS_DIR:-/opt/flujos}"

if node -e '
const fs = require("fs");
const path = require("path");
const dir = process.argv[1];
const ids = new Set();
for (const nombre of fs.readdirSync(dir)) {
  if (!nombre.endsWith(".json")) continue;
  const flujo = JSON.parse(fs.readFileSync(path.join(dir, nombre), "utf8"));
  if (!flujo.id) {
    console.error("aviso: " + nombre + " no tiene id estable");
    process.exit(1);
  }
  if (ids.has(flujo.id)) {
    console.error("aviso: id repetido " + flujo.id + " en " + nombre);
    process.exit(1);
  }
  ids.add(flujo.id);
}
' "$FLUJOS_DIR"; then
  # --separate importa la CARPETA (con un archivo suelto n8n lo rechaza). n8n
  # 1.63.4 no tiene `--update`: el upsert por id es lo que actualiza el flujo
  # existente en vez de insertar otro.
  n8n import:workflow --separate --input="$FLUJOS_DIR" \
    || echo "aviso: no se pudieron importar los flujos" >&2
else
  echo "aviso: hay flujos sin id estable; no se importa nada para no duplicarlos" >&2
fi

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
for id in $(n8n list:workflow --onlyId 2>/dev/null || true); do
  n8n update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
done

exec n8n start
