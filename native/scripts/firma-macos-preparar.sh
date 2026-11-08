#!/usr/bin/env bash
# firma-macos-preparar — decide con qué identidad se firma el bundle de macOS y, si hay certificado propio,
# lo importa a un llavero TEMPORAL del runner (PER1108A, 2026-11-08). Contrato: architecture/centro-versiones-1105.md.
#
# Entrada (variables de entorno, vienen de secretos del repo; NUNCA se imprimen):
#   MACOS_CERT_P12_BASE64   certificado de firma de código autofirmado (.p12) en base64
#   MACOS_CERT_PASSWORD     su contraseña
# Salida (GITHUB_OUTPUT): identidad=<huella SHA-1 del certificado | "-"> · modo=certificado|adhoc
#
# Sin los secretos: identidad "-" = firma AD-HOC del bundle. Sigue sellando Info.plist y recursos (que es lo que
# hace que macOS pregunte por Bluetooth, micrófono y cámara), pero el hash de la app cambia con cada build, así que
# macOS vuelve a preguntar tras cada actualización. Con el certificado, el «requisito designado» es
# identificador + certificado y los permisos concedidos SOBREVIVEN a las actualizaciones.
set -euo pipefail

SALIDA="${GITHUB_OUTPUT:-/dev/stdout}"

if [ -z "${MACOS_CERT_P12_BASE64:-}" ] || [ -z "${MACOS_CERT_PASSWORD:-}" ]; then
  echo "::notice::Sin MACOS_CERT_P12_BASE64 / MACOS_CERT_PASSWORD: el bundle de macOS se firma ad-hoc (los permisos de macOS se vuelven a pedir tras cada actualización). Pasos para crear el certificado: architecture/centro-versiones-1105.md «Firma de macOS»."
  { echo "identidad=-"; echo "modo=adhoc"; } >> "$SALIDA"
  exit 0
fi

LLAVERO="$RUNNER_TEMP/starseed-firma.keychain-db"
CLAVE_LLAVERO="$(uuidgen)"
P12="$RUNNER_TEMP/starseed-firma.p12"

printf '%s' "$MACOS_CERT_P12_BASE64" | base64 --decode > "$P12"
security create-keychain -p "$CLAVE_LLAVERO" "$LLAVERO"
security set-keychain-settings -lut 21600 "$LLAVERO"
security unlock-keychain -p "$CLAVE_LLAVERO" "$LLAVERO"
security import "$P12" -k "$LLAVERO" -P "$MACOS_CERT_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
rm -f "$P12"
# Que codesign use la clave sin preguntar (en un runner no hay quien conteste).
security set-key-partition-list -S apple-tool:,apple: -s -k "$CLAVE_LLAVERO" "$LLAVERO" >/dev/null
# El llavero temporal va primero en la lista de búsqueda (sin quitar los del sistema).
security list-keychains -d user -s "$LLAVERO" $(security list-keychains -d user | tr -d '"')

# Un certificado autofirmado no es «de confianza» para el sistema: se lista SIN -v y se coge su huella.
HUELLA="$(security find-identity -p codesigning "$LLAVERO" | awk '/^ +[0-9]+\) [0-9A-F]{40}/{print $2; exit}')"
if [ -z "$HUELLA" ]; then
  echo "::error::El .p12 se importó pero no trae una identidad de firma de código (¿se exportó con la clave privada?)."
  exit 1
fi
{ echo "identidad=$HUELLA"; echo "modo=certificado"; } >> "$SALIDA"
echo "Firma de macOS: certificado propio importado a un llavero temporal."
