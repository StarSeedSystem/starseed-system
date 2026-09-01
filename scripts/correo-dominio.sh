#!/usr/bin/env bash
# ============================================================================
# StarSeed OS — comprobador del dominio de correo de la red (Adenda 198)
# ----------------------------------------------------------------------------
# Uso:  bash scripts/correo-dominio.sh star.seed.us.kg
#
# Dice, con el DNS real en la mano, qué falta para que las direcciones
# `usuario@<dominio>` reciban y envíen correo de todo internet:
#   · MX     → quién recibe (Cloudflare Email Routing)
#   · SPF    → quién puede enviar en tu nombre
#   · DKIM   → firma del proveedor de envío (Resend/Brevo)
#   · DMARC  → qué hacer con lo que no cuadre
# No cambia nada: solo comprueba y explica el siguiente paso.
# ============================================================================
set -uo pipefail

DOM="${1:-}"
if [ -z "$DOM" ]; then
  echo "Uso: bash scripts/correo-dominio.sh <dominio>   (p.ej. star.seed.us.kg)"
  exit 1
fi

DIG="dig +short"
ok()   { printf "  ✅ %s\n" "$1"; }
falta(){ printf "  ❌ %s\n" "$1"; }

echo "══ Dominio: $DOM ══"

echo "1) ¿Existe la zona?"
NS="$($DIG NS "$DOM" @1.1.1.1 | head -1)"
if [ -n "$NS" ]; then ok "servidores de nombres: $NS"; else falta "sin NS: el dominio aún no está delegado (regístralo y apunta la DNS)"; fi

echo "2) Recepción (MX)"
MX="$($DIG MX "$DOM" @1.1.1.1 | sort | head -3)"
if [ -n "$MX" ]; then echo "$MX" | while read -r l; do ok "MX $l"; done
else
  falta "sin MX — en Cloudflare: Email → Email Routing → Enable, y añade los MX que te dé"
fi

echo "3) Envío (SPF)"
SPF="$($DIG TXT "$DOM" @1.1.1.1 | tr -d '"' | grep -i 'v=spf1' | head -1)"
if [ -n "$SPF" ]; then ok "SPF: $SPF"; else
  falta "sin SPF — añade TXT en @:  v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all"
fi

echo "4) Firma (DKIM)"
DK=""
for sel in resend._domainkey mail._domainkey brevo._domainkey google._domainkey; do
  V="$($DIG TXT "$sel.$DOM" @1.1.1.1 | head -1)"
  [ -n "$V" ] && { ok "DKIM en $sel"; DK=1; }
done
[ -z "$DK" ] && falta "sin DKIM — lo da tu proveedor de envío (Resend/Brevo) al verificar el dominio"

echo "5) Política (DMARC)"
DM="$($DIG TXT "_dmarc.$DOM" @1.1.1.1 | tr -d '"' | head -1)"
if [ -n "$DM" ]; then ok "DMARC: $DM"; else
  falta "sin DMARC — añade TXT en _dmarc:  v=DMARC1; p=quarantine; rua=mailto:postmaster@$DOM; adkim=r; aspf=r"
fi

echo
echo "Cuando MX, SPF, DKIM y DMARC salgan en verde, dime y pongo"
echo "NEXT_PUBLIC_STARSEED_MAIL_DOMAIN=$DOM en el despliegue: cada cuenta verá"
echo "su dirección pública aparecer sola en «Correos vinculados»."
