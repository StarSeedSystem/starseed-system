#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
#
# Idempotencia (PRD1005Tbsb): cada flujo lleva un `id` estable en su JSON.
# Importamos CADA ARCHIVO por separado (sin `--separate`): n8n hace upsert por
# `id` en importaciones individuales, evitando duplicados al reiniciar.
set -eu

FLUJOS="${N8N_FLUJOS_DIR:-/opt/flujos}"
N8N="${N8N_BIN:-n8n}"

# Importar cada flujo individualmente: upsert por id garantizado.
if [ -d "$FLUJOS" ]; then
  for flujo in "$FLUJOS"/*.json; do
    [ -e "$flujo" ] || continue
    "$N8N" import:workflow --input="$flujo" \
      || echo "aviso: no se pudo importar $flujo" >&2
  done
fi

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
for id in $("$N8N" list:workflow --onlyId 2>/dev/null || true); do
  "$N8N" update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
done

exec "$N8N" start