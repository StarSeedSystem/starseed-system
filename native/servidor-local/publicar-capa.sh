#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════
# publicar-capa.sh — arma, FIRMA y publica una capa del servidor local (CAP1107A · T1, 2026-11-07).
# Contrato: architecture/apps-autonomas-sin-internet.md §10. Lo usan .github/workflows/native-build.yml
# (job `servidor-capa`) y .github/workflows/servidor-capa.yml (cada publicación de la web).
#
#   bash native/servidor-local/publicar-capa.sh <servidor-next.tar> [<etiqueta del release versionado>]
#
# Entorno:
#   TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD)  la clave del UPDATER (secreto del repo). Sin ella no se firma
#                                            ni se publica nada: la app no acepta capas sin firma.
#   GH_TOKEN, GITHUB_REPOSITORY              para `gh release`.
#   PUBLICAR_CANAL=1                         además del release versionado, el canal FIJO que mira la app
#                                            (Release `servidor-local`, prerelease: nunca «latest», así no
#                                            toca el latest.json del updater). Sin esto, solo se arma y se firma.
#   GUARDAR_CAPAS (4)                        capas que se quedan en el canal (las demás se borran).
#
# Orden en el canal: primero la capa y su manifiesto, el puntero `latest-servidor.json` lo ÚLTIMO (la
# app nunca ve un puntero a archivos que aún no están). La clave privada nunca se escribe en disco.
# ════════════════════════════════════════════════════════════════════════════════════════════
set -euo pipefail

TAR="${1:?uso: publicar-capa.sh <servidor-next.tar> [etiqueta]}"
ETIQUETA="${2:-}"
SALIDA="${SALIDA_CAPA:-dist-capa}"
REPO="${GITHUB_REPOSITORY:?falta GITHUB_REPOSITORY}"
CANAL="servidor-local"
GUARDAR="${GUARDAR_CAPAS:-4}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$SALIDA"
node "$AQUI/capa.mjs" armar --tar "$TAR" --salida "$SALIDA"
MAN="$(ls "$SALIDA"/servidor-capa-*.json)"
BUILD="$(basename "$MAN" .json)"
BUILD="${BUILD#servidor-capa-}"
ARCH="$SALIDA/servidor-capa-$BUILD.tar.gz"
test -s "$ARCH"

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "::warning::Sin el secreto TAURI_SIGNING_PRIVATE_KEY la capa $BUILD no se firma ni se publica (la app no usa capas sin firma)."
  exit 0
fi
# Firma minisign con la clave del updater (la CLI lee la clave y su contraseña del entorno).
npx --yes @tauri-apps/cli@2 signer sign "$MAN" > /dev/null
test -s "$MAN.sig"
node "$AQUI/capa.mjs" canal --manifiesto "$MAN" --firma "$MAN.sig" \
  --base "https://github.com/$REPO/releases/download/$CANAL" --salida "$SALIDA/latest-servidor.json"

# 1 · Junto a sus instaladores (release versionado, borrador): para revisarla y de archivo.
if [ -n "$ETIQUETA" ]; then
  gh release upload "$ETIQUETA" "$ARCH" "$MAN" "$MAN.sig" "$SALIDA/latest-servidor.json" --clobber -R "$REPO" \
    || echo "::warning::No se pudo adjuntar la capa $BUILD al release $ETIQUETA."
fi

# 2 · El canal fijo que mira la app.
if [ "${PUBLICAR_CANAL:-0}" != "1" ]; then
  echo "::notice::Capa $BUILD armada y firmada; el canal NO se toca (variable del repo SERVIDOR_CAPAS_CANAL=1 para publicarla)."
  exit 0
fi
if ! gh release view "$CANAL" -R "$REPO" > /dev/null 2>&1; then
  gh release create "$CANAL" -R "$REPO" --prerelease --target "${GITHUB_SHA:-main}" --title "Servidor local · capas" \
    --notes "Canal de las capas del servidor local de StarSeed OS (architecture/apps-autonomas-sin-internet.md §10). Lo escribe el CI; la app solo usa lo que verifica con la clave del updater."
fi
gh release upload "$CANAL" "$ARCH" "$MAN" "$MAN.sig" --clobber -R "$REPO"
gh release upload "$CANAL" "$SALIDA/latest-servidor.json" --clobber -R "$REPO"
echo "::notice::Capa $BUILD publicada en el canal $CANAL."

# 3 · Poda: se quedan las $GUARDAR capas más recientes.
gh release view "$CANAL" -R "$REPO" --json assets > "$SALIDA/assets.json"
node "$AQUI/capa.mjs" podar --assets "$SALIDA/assets.json" --guardar "$GUARDAR" --salida "$SALIDA/borrar.txt"
while IFS= read -r n; do
  [ -n "$n" ] && gh release delete-asset "$CANAL" "$n" -R "$REPO" -y || true
done < "$SALIDA/borrar.txt"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "Canal: https://github.com/$REPO/releases/download/$CANAL/latest-servidor.json → $BUILD" >> "$GITHUB_STEP_SUMMARY"
fi
