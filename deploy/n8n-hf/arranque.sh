#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
#
# Idempotencia (PRD1005Tbsb): cada flujo lleva un `id` estable en su JSON.
# Antes de importar, comprobamos si ya existe un flujo con ese ID en n8n.
# Importamos cada flujo individualmente para control total y logging claro.
set -eu

FLUJOS="${N8N_FLUJOS_DIR:-/opt/flujos}"
N8N="${N8N_BIN:-n8n}"

# Extrae el ID de un archivo JSON de flujo
get_workflow_id() {
  grep '"id"' "$1" | head -1 | sed 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

# Solo importamos si hay algún JSON; un glob sin coincidencias no debe romper.
if [ -d "$FLUJOS" ]; then
  set -- "$FLUJOS"/*.json
  if [ -e "$1" ]; then
    # Obtener IDs de flujos existentes en n8n
    existing_ids=$("$N8N" list:workflow --onlyId 2>/dev/null || true)

    for workflow_file in "$FLUJOS"/*.json; do
      [ -e "$workflow_file" ] || continue
      workflow_id=$(get_workflow_id "$workflow_file")
      [ -n "$workflow_id" ] || continue

      # Comprobar si el flujo ya existe
      if echo "$existing_ids" | grep -q "^$workflow_id$"; then
        echo "Flujo $workflow_id ya existe, se actualiza vía importación (upsert por ID)"
      else
        echo "Importando nuevo flujo: $workflow_id"
      fi
      # Importar individualmente para mejor control
      "$N8N" import:workflow --input="$workflow_file" \
        || echo "aviso: no se pudo importar el flujo $workflow_file" >&2
    done
  fi
fi

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
for id in $("$N8N" list:workflow --onlyId 2>/dev/null || true); do
  "$N8N" update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
done

exec "$N8N" start