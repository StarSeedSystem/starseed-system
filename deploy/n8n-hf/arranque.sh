#!/bin/sh
# Arranque del Space: el disco gratuito no persiste, así que en cada arranque
# se importan los flujos versionados en el repo y se activan por la CLI.
set -eu

for f in /opt/flujos/*.json; do
  n8n import:workflow --input="$f" --separate || echo "aviso: no se pudo importar $f" >&2
done

# Activar uno a uno: si un flujo no se puede activar (falta credencial, p.ej.)
# no se tumban los demás ni el arranque.
for id in $(n8n list:workflow --onlyId 2>/dev/null || true); do
  n8n update:workflow --id="$id" --active=true || echo "aviso: flujo $id sin activar" >&2
done

exec n8n start
