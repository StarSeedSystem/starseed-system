#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# StarSeed · Activar el ENVÍO de correo a todo internet (plan gratuito)
# (Adenda 200 · 2026-09-01)
#
# Recibir ya funciona: Cloudflare Email Routing entrega *@star.seed.dpdns.org
# en el buzón del proyecto. Para ENVIAR hace falta un proveedor con reputación
# de IP y firma DKIM. Cloudflare Email Sending exige plan Workers de pago, así
# que la vía gratuita es Resend (3.000/mes) o Brevo (300/día).
#
# Este script hace TODO lo automatizable con solo la clave del proveedor:
#   1. Da de alta el dominio en el proveedor.
#   2. Lee los registros DKIM/SPF que exige y los crea en Cloudflare por API.
#   3. Lanza la verificación y espera el resultado.
#   4. Deja la clave en .env.local y (si hay token) en Vercel.
#
# USO:
#   RESEND_API_KEY=re_xxx ./scripts/correo-envio-setup.sh
#   BREVO_API_KEY=xkeysib-xxx ./scripts/correo-envio-setup.sh      # (solo DNS)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${STARSEED_MAIL_DOMAIN:-star.seed.dpdns.org}"
CF_ZONE="${CF_ZONE_ID:-6157370aadac50f96094c1689813f958}"
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${CF_TOKEN}" && -f "${RAIZ}/.env.local" ]]; then
  CF_TOKEN="$(grep -E '^CLOUDFLARE_API_TOKEN=' "${RAIZ}/.env.local" | head -1 | cut -d= -f2- || true)"
fi
[[ -z "${CF_TOKEN}" ]] && { echo "✗ Falta CLOUDFLARE_API_TOKEN (o ponlo en .env.local)."; exit 1; }

cf() { # cf <método> <ruta> [json]
  curl -sS -X "$1" "https://api.cloudflare.com/client/v4${2}" \
    -H "Authorization: Bearer ${CF_TOKEN}" -H "Content-Type: application/json" \
    ${3:+--data "$3"}
}

# Crea o actualiza un registro DNS (idempotente por nombre+tipo).
poner_dns() { # poner_dns <tipo> <nombre> <contenido> [prioridad]
  local tipo="$1" nombre="$2" contenido="$3" prio="${4:-}"
  local cuerpo
  cuerpo="$(python3 - "$tipo" "$nombre" "$contenido" "$prio" <<'PY'
import json, sys
tipo, nombre, contenido, prio = sys.argv[1:5]
d = {"type": tipo, "name": nombre, "content": contenido, "ttl": 1, "proxied": False}
if prio: d["priority"] = int(prio)
print(json.dumps(d))
PY
)"
  local existente
  existente="$(cf GET "/zones/${CF_ZONE}/dns_records?type=${tipo}&name=${nombre}" \
    | python3 -c 'import sys,json;r=json.load(sys.stdin).get("result",[]);print(r[0]["id"] if r else "")')"
  if [[ -n "${existente}" ]]; then
    cf PUT "/zones/${CF_ZONE}/dns_records/${existente}" "${cuerpo}" >/dev/null
    echo "  ↻ ${tipo} ${nombre}"
  else
    cf POST "/zones/${CF_ZONE}/dns_records" "${cuerpo}" >/dev/null
    echo "  + ${tipo} ${nombre}"
  fi
}

# ── Resend ───────────────────────────────────────────────────────────────────
if [[ -n "${RESEND_API_KEY:-}" ]]; then
  echo "▸ Proveedor: Resend · dominio ${DOMINIO}"

  alta="$(curl -sS -X POST https://api.resend.com/domains \
    -H "Authorization: Bearer ${RESEND_API_KEY}" -H "Content-Type: application/json" \
    --data "{\"name\":\"${DOMINIO}\",\"region\":\"eu-west-1\"}")"

  # Si ya existía, lo buscamos en el listado.
  DOM_ID="$(printf '%s' "${alta}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
  if [[ -z "${DOM_ID}" ]]; then
    DOM_ID="$(curl -sS https://api.resend.com/domains -H "Authorization: Bearer ${RESEND_API_KEY}" \
      | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',[]);print(next((x['id'] for x in d if x['name']=='${DOMINIO}'),''))")"
    alta="$(curl -sS "https://api.resend.com/domains/${DOM_ID}" -H "Authorization: Bearer ${RESEND_API_KEY}")"
  fi
  [[ -z "${DOM_ID}" ]] && { echo "✗ Resend no devolvió dominio. Respuesta: ${alta}"; exit 1; }
  echo "  dominio en Resend: ${DOM_ID}"

  echo "▸ Creando registros en Cloudflare…"
  printf '%s' "${alta}" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for r in d.get("records", []):
    print("\t".join([r.get("type",""), r.get("name",""), r.get("value",""), str(r.get("priority") or "")]))
' | while IFS=$'\t' read -r tipo nombre valor prio; do
    [[ -z "${tipo}" ]] && continue
    poner_dns "${tipo}" "${nombre}" "${valor}" "${prio}"
  done

  echo "▸ Verificando en Resend…"
  curl -sS -X POST "https://api.resend.com/domains/${DOM_ID}/verify" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" >/dev/null
  for i in $(seq 1 12); do
    sleep 10
    estado="$(curl -sS "https://api.resend.com/domains/${DOM_ID}" -H "Authorization: Bearer ${RESEND_API_KEY}" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status","?"))')"
    echo "  intento ${i}: ${estado}"
    [[ "${estado}" == "verified" ]] && break
  done

  CLAVE_NOMBRE="RESEND_API_KEY"; CLAVE_VALOR="${RESEND_API_KEY}"

# ── Brevo ────────────────────────────────────────────────────────────────────
elif [[ -n "${BREVO_API_KEY:-}" ]]; then
  echo "▸ Proveedor: Brevo · dominio ${DOMINIO}"
  curl -sS -X POST "https://api.brevo.com/v3/senders/domains" \
    -H "api-key: ${BREVO_API_KEY}" -H "Content-Type: application/json" \
    --data "{\"name\":\"${DOMINIO}\"}" >/dev/null || true
  echo "▸ Registros que pide Brevo:"
  curl -sS "https://api.brevo.com/v3/senders/domains/${DOMINIO}" -H "api-key: ${BREVO_API_KEY}" \
    | python3 -m json.tool
  echo "  (crea los DKIM que muestre arriba con poner_dns, o pásalos por la UI)"
  CLAVE_NOMBRE="BREVO_API_KEY"; CLAVE_VALOR="${BREVO_API_KEY}"
else
  echo "✗ Define RESEND_API_KEY o BREVO_API_KEY antes de ejecutar."; exit 1
fi

# ── Guardar la clave donde el OS la lee ──────────────────────────────────────
if [[ -f "${RAIZ}/.env.local" ]] && ! grep -q "^${CLAVE_NOMBRE}=" "${RAIZ}/.env.local"; then
  printf '\n%s=%s\n' "${CLAVE_NOMBRE}" "${CLAVE_VALOR}" >> "${RAIZ}/.env.local"
  echo "▸ ${CLAVE_NOMBRE} añadida a .env.local"
fi

if [[ -n "${VERCEL_TOKEN:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
  curl -sS -X POST "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=true${VERCEL_TEAM_ID:+&teamId=${VERCEL_TEAM_ID}}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" -H "Content-Type: application/json" \
    --data "{\"key\":\"${CLAVE_NOMBRE}\",\"value\":\"${CLAVE_VALOR}\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}" >/dev/null
  echo "▸ ${CLAVE_NOMBRE} subida a Vercel (requiere redeploy)."
fi

echo "✓ Listo. Comprueba el estado en: /api/mail/enviar"
