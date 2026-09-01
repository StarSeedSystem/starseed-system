#!/usr/bin/env bash
# ============================================================================
# StarSeed OS — montaje del correo de la red por API (Adenda 199)
# ----------------------------------------------------------------------------
# Se ejecuta EN CUANTO el dominio esté registrado en DigitalPlat. Crea toda la
# zona por API: subdominio del correo, MX de recepción, SPF, DMARC y (si se le
# pasan) los DKIM del proveedor de envío. No toca nada más de la cuenta.
#
#   export DIGITALPLAT_API_KEY=dp_live_...
#   bash scripts/correo-starseed-setup.sh seed.dpdns.org star.seed.dpdns.org
# ============================================================================
set -uo pipefail

ZONA="${1:-seed.dpdns.org}"          # dominio registrado (la zona DNS)
CORREO="${2:-star.seed.dpdns.org}"   # subdominio que llevará el correo
K="${DIGITALPLAT_API_KEY:?exporta DIGITALPLAT_API_KEY}"
B="https://domain-api.digitalplat.org/api/v1"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

api() { # método ruta [json]
  local m="$1" p="$2" d="${3:-}"
  if [ -n "$d" ]; then
    curl -s -m 30 -A "$UA" -H "Accept: application/json" -H "Content-Type: application/json" \
      -H "Authorization: Bearer $K" -H "Idempotency-Key: ss-$(date +%s)-$RANDOM" \
      -X "$m" -d "$d" "$B$p"
  else
    curl -s -m 30 -A "$UA" -H "Accept: application/json" -H "Authorization: Bearer $K" \
      -H "Idempotency-Key: ss-$(date +%s)-$RANDOM" -X "$m" "$B$p"
  fi
}

echo "══ Zona: $ZONA   ·   Correo en: $CORREO ══"
echo "1) ¿La zona es nuestra?"
api GET "/domains/$ZONA" | head -c 400; echo

echo "2) Registros DNS actuales"
api GET "/domains/$ZONA/dns" | head -c 800; echo
