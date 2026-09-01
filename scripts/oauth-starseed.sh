#!/usr/bin/env bash
# ============================================================================
# StarSeed OS — alta del cliente OAuth de Google (Adenda 196)
# ----------------------------------------------------------------------------
# Hace por terminal TODO lo que Google permite automatizar: crear el proyecto,
# habilitar las APIs y dejar preparada la pantalla exacta donde se pulsa
# «Crear cliente». El último clic es obligatoriamente manual: Google NO expone
# API ni comando para crear clientes OAuth de tipo «aplicación web».
#
# Uso:
#   1) gcloud auth login fundacionstarseed@gmail.com     (lo haces tú)
#   2) bash scripts/oauth-starseed.sh
#   3) pulsa «Crear cliente» en la URL que imprime, copia el ID y pásamelo
# ============================================================================
set -euo pipefail

PROYECTO="${1:-starseed-os}"
CUENTA_ESPERADA="fundacionstarseed@gmail.com"

echo "== 1/5  Cuenta activa =="
ACTIVA="$(gcloud config get-value account 2>/dev/null || true)"
echo "   $ACTIVA"
if [ "$ACTIVA" != "$CUENTA_ESPERADA" ]; then
  echo "   ⚠️  Esperaba $CUENTA_ESPERADA. Ejecuta primero:"
  echo "        gcloud auth login $CUENTA_ESPERADA"
  exit 1
fi

echo "== 2/5  Proyecto '$PROYECTO' =="
if gcloud projects describe "$PROYECTO" >/dev/null 2>&1; then
  echo "   ya existe, lo reutilizo"
else
  gcloud projects create "$PROYECTO" --name="StarSeed OS"
fi
gcloud config set project "$PROYECTO" >/dev/null

echo "== 3/5  APIs necesarias =="
gcloud services enable drive.googleapis.com people.googleapis.com --project="$PROYECTO"

echo "== 4/5  Datos que hay que pegar en la consola =="
cat <<TXT

   Tipo de aplicación : Aplicación web
   Nombre             : StarSeed OS
   Orígenes JS autorizados:
     https://starseed-os.vercel.app
     http://localhost:9002
   URIs de redirección autorizados:
     https://starseed-os.vercel.app/api/storage/oauth/callback
     http://localhost:9002/api/storage/oauth/callback

TXT

echo "== 5/5  Abre esta página y pulsa «Crear cliente» =="
echo "   https://console.cloud.google.com/auth/clients?project=$PROYECTO"
echo
echo "   Después, pantalla de consentimiento (una vez):"
echo "   https://console.cloud.google.com/auth/branding?project=$PROYECTO"
echo
echo "   Cuando tengas el ID de cliente (termina en .apps.googleusercontent.com),"
echo "   pásamelo y lo cableo en Vercel y en .env.local."
