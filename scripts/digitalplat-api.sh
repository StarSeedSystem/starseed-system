#!/usr/bin/env bash
# Cliente mínimo de la API de DigitalPlat (Adenda 199)
K="${DIGITALPLAT_API_KEY:?exporta DIGITALPLAT_API_KEY}"
B="https://domain-api.digitalplat.org/api/v1"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

dpget() {
  curl -s -m 25 -A "$UA" -H "Accept: application/json" -H "Authorization: Bearer $K" "$B$1"
}
dppost() {
  curl -s -m 30 -A "$UA" -H "Accept: application/json" -H "Content-Type: application/json" \
    -H "Authorization: Bearer $K" -H "Idempotency-Key: ss-$(date +%s)-$RANDOM" \
    -X POST -d "$2" "$B$1"
}
dpdel() {
  curl -s -m 25 -A "$UA" -H "Accept: application/json" -H "Authorization: Bearer $K" \
    -H "Idempotency-Key: ss-$(date +%s)-$RANDOM" -X DELETE "$B$1"
}
