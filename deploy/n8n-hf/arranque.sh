#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
#
# Idempotencia (PRD1005Tb): cada flujo lleva un `id` estable en su JSON y se
# importa cada flujo con `--separate`. n8n 1.63.4 no tiene `--update`, pero hace
# upsert por `id` (ImportService.importWorkflows), así que reiniciar actualiza
# el mismo flujo en vez de crear una copia nueva. Sin `id` fijo, n8n genera un
# nanoId distinto en cada importación y el Space se llena de duplicados.
# Importando individualmente se controla mejor cada flujo.
set -eu

FLUJOS="${N8N_FLUJOS_DIR:-/opt/flujos}"
N8N="${N8N_BIN:-n8n}"

# Solo importamos si hay algún JSON; un glob sin coincidencias no debe romper.
if [ -d "$FLUJOS" ]; then
  set -- "$FLUJOS"/*.json
  if [ -e "$1" ]; then
    for flujo in "$FLUJOS"/*.json; do
      "$N8N" import:workflow --separate --input="$flujo" || echo "aviso: fallo import $flujo" >&2
    done
  fi
fi

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
for id in $("$N8N" list:workflow --onlyId 2>/dev/null || true); do
  "$N8N" update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
done

exec "$N8N" start