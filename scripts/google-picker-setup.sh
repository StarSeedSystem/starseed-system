#!/usr/bin/env bash
# ============================================================================
# StarSeed OS — clave de API y número de proyecto para el selector de Google
# (Adenda 196). A diferencia del cliente OAuth, ESTO SÍ se hace entero por
# terminal. Pensado para pegarse en Cloud Shell del proyecto de StarSeed.
# ============================================================================
set -uo pipefail

PROJ="${1:-gen-lang-client-0629018675}"
gcloud config set project "$PROJ" >/dev/null

echo "== APIs =="
gcloud services enable apikeys.googleapis.com drive.googleapis.com people.googleapis.com >/dev/null
gcloud services enable picker.googleapis.com >/dev/null 2>&1 || echo "   (Picker API: habilítala en la consola si el selector se queja)"

echo "== Número de proyecto =="
NUM="$(gcloud projects describe "$PROJ" --format='value(projectNumber)')"

echo "== Clave de API restringida al selector =="
gcloud services api-keys create \
  --display-name="StarSeed OS Picker" \
  --allowed-referrers="https://starseed-os.vercel.app/*,http://localhost:9002/*" \
  --api-target=service=picker.googleapis.com >/dev/null 2>&1 \
  || gcloud services api-keys create --display-name="StarSeed OS Picker" >/dev/null 2>&1 \
  || echo "   (ya existía)"

KEY_ID="$(gcloud services api-keys list --filter="displayName='StarSeed OS Picker'" --format='value(uid)' | head -1)"
KEY="$(gcloud services api-keys get-key-string "$KEY_ID" --format='value(keyString)' 2>/dev/null)"

cat <<TXT

════════ PÁSAME ESTAS DOS LÍNEAS ════════
NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER=$NUM
NEXT_PUBLIC_GOOGLE_API_KEY=$KEY
═════════════════════════════════════════
(La clave es PÚBLICA por diseño: está restringida al selector y a tus dominios.)
TXT
