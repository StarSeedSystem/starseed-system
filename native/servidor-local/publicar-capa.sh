#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════
# publicar-capa.sh — arma, FIRMA y publica una capa del servidor local (CAP1107A · T1, 2026-11-07).
# Contrato: architecture/apps-autonomas-sin-internet.md §10. Lo usan .github/workflows/native-build.yml
# (job `servidor-capa`) y .github/workflows/servidor-capa.yml (cada publicación de la web).
#
#   bash native/servidor-local/publicar-capa.sh [--anillo global|prueba] [--simular] <servidor-next.tar> [<etiqueta>]
#
#   --anillo global   (por defecto) puntero `latest-servidor.json`, el que mira toda la app.
#   --anillo prueba   puntero `latest-servidor-prueba.json`; NO toca `latest-servidor.json` (BAP1127B, §4.2).
#   --simular         imprime los comandos `gh` sin red ni firma (no arma nada).
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

ANILLO="global"
SIMULAR=0
POS=()
SUB=""
case "${1:-}" in promover|retirar) SUB="$1"; shift ;; esac
while [ $# -gt 0 ]; do
  case "$1" in
    --anillo|--a) ANILLO="${2:?$1 pide global o prueba}"; shift 2 ;;
    --simular) SIMULAR=1; shift ;;
    *) POS+=("$1"); shift ;;
  esac
done
case "$ANILLO" in global|prueba) ;; *) echo "anillo desconocido: $ANILLO (global|prueba)" >&2; exit 2 ;; esac
PUNTERO="latest-servidor.json"
[ "$ANILLO" = "prueba" ] && PUNTERO="latest-servidor-prueba.json"
SALIDA="${SALIDA_CAPA:-dist-capa}"
if [ "$SIMULAR" = "1" ]; then REPO="${GITHUB_REPOSITORY:-org/repo}"; else REPO="${GITHUB_REPOSITORY:?falta GITHUB_REPOSITORY}"; fi
CANAL="servidor-local"
GUARDAR="${GUARDAR_CAPAS:-4}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

gh() { if [ "$SIMULAR" = "1" ]; then echo "gh $*"; else command gh "$@"; fi; }

# ── promover / retirar (BAP1127X): la firma vive en el manifiesto; promover solo mueve un puntero. ──
#   publicar-capa.sh promover <build> --a prueba|global [--simular]
#   publicar-capa.sh retirar  <build> [--simular]        (firma retiradas.json con la clave del updater)
if [ -n "$SUB" ]; then
  BUILD="${POS[0]:?uso: publicar-capa.sh promover|retirar <build> [--a prueba|global] [--simular]}"
  BUILD="${BUILD#servidor-capa-}"
  case "$BUILD" in *[!A-Za-z0-9_-]*|"") echo "build no válida: $BUILD" >&2; exit 2 ;; esac
  MAN_N="servidor-capa-$BUILD.json"
  mkdir -p "$SALIDA"
  if [ "$SUB" = "promover" ]; then
    PUNTERO="latest-servidor.json"; [ "$ANILLO" = "prueba" ] && PUNTERO="latest-servidor-prueba.json"
    if [ "$SIMULAR" = "1" ]; then
      gh release view "$CANAL" -R "$REPO" --json assets
      gh release download "$CANAL" -R "$REPO" -p "$MAN_N" -p "$MAN_N.sig" -D "$SALIDA" --clobber
      gh release upload "$CANAL" "$SALIDA/$PUNTERO" --clobber -R "$REPO"
      exit 0
    fi
    command gh release view "$CANAL" -R "$REPO" --json assets -q '.assets[].name' > "$SALIDA/existentes.txt"
    for n in "$MAN_N" "$MAN_N.sig" "servidor-capa-$BUILD.tar.gz"; do
      grep -qxF "$n" "$SALIDA/existentes.txt" || { echo "::error::Falta $n en el canal $CANAL: no se promueve." >&2; exit 1; }
    done
    command gh release download "$CANAL" -R "$REPO" -p "$MAN_N" -p "$MAN_N.sig" -D "$SALIDA" --clobber
    node "$AQUI/capa.mjs" canal --manifiesto "$SALIDA/$MAN_N" --firma "$SALIDA/$MAN_N.sig" \
      --base "https://github.com/$REPO/releases/download/$CANAL" --salida "$SALIDA/$PUNTERO"
    gh release upload "$CANAL" "$SALIDA/$PUNTERO" --clobber -R "$REPO"
    # Tras promover, la capa sigue en el canal (una poda en carrera no puede habérsela llevado).
    command gh release view "$CANAL" -R "$REPO" --json assets -q '.assets[].name' | grep -qxF "servidor-capa-$BUILD.tar.gz" \
      || { echo "::error::La build $BUILD desapareció del canal tras promoverla." >&2; exit 1; }
    echo "::notice::Build $BUILD promovida a $PUNTERO."
  else
    if [ "$SIMULAR" = "1" ]; then
      gh release download "$CANAL" -R "$REPO" -p retiradas.json -D "$SALIDA" --clobber
      gh release upload "$CANAL" "$SALIDA/retiradas.json" "$SALIDA/retiradas.json.sig" --clobber -R "$REPO"
      exit 0
    fi
    [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || { echo "::error::Sin TAURI_SIGNING_PRIVATE_KEY no se puede firmar la retirada." >&2; exit 1; }
    rm -f "$SALIDA/retiradas.json" "$SALIDA/retiradas.json.sig"
    command gh release download "$CANAL" -R "$REPO" -p retiradas.json -D "$SALIDA" --clobber 2> /dev/null || true
    PREVIAS=(); [ -s "$SALIDA/retiradas.json" ] && PREVIAS=(--previas "$SALIDA/retiradas.json")
    node "$AQUI/capa.mjs" retirar --build "$BUILD" ${PREVIAS[@]+"${PREVIAS[@]}"} --salida "$SALIDA/retiradas.nuevo.json"
    mv "$SALIDA/retiradas.nuevo.json" "$SALIDA/retiradas.json"
    npx --yes @tauri-apps/cli@2 signer sign "$SALIDA/retiradas.json" > /dev/null
    test -s "$SALIDA/retiradas.json.sig"
    gh release upload "$CANAL" "$SALIDA/retiradas.json" "$SALIDA/retiradas.json.sig" --clobber -R "$REPO"
    echo "::notice::Build $BUILD retirada y firmada."
  fi
  exit 0
fi

TAR="${POS[0]:?uso: publicar-capa.sh [--anillo global|prueba] [--simular] <servidor-next.tar> [etiqueta]}"
ETIQUETA="${POS[1]:-}"

if [ "$SIMULAR" = "1" ]; then
  # Sin red ni firma: solo se muestran las subidas que haría.
  BUILD="simulada"
  ARCH="$SALIDA/servidor-capa-$BUILD.tar.gz"; MAN="$SALIDA/servidor-capa-$BUILD.json"
  [ -n "$ETIQUETA" ] && gh release upload "$ETIQUETA" "$ARCH" "$MAN" "$MAN.sig" "$SALIDA/$PUNTERO" --clobber -R "$REPO"
  gh release upload "$CANAL" "$ARCH" "$MAN" "$MAN.sig" --clobber -R "$REPO"
  gh release upload "$CANAL" "$SALIDA/$PUNTERO" --clobber -R "$REPO"
  exit 0
fi

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
  --base "https://github.com/$REPO/releases/download/$CANAL" --salida "$SALIDA/$PUNTERO"

# 1 · Junto a sus instaladores (release versionado, borrador): para revisarla y de archivo.
if [ -n "$ETIQUETA" ]; then
  gh release upload "$ETIQUETA" "$ARCH" "$MAN" "$MAN.sig" "$SALIDA/$PUNTERO" --clobber -R "$REPO" \
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
gh release upload "$CANAL" "$SALIDA/$PUNTERO" --clobber -R "$REPO"
echo "::notice::Capa $BUILD publicada en el canal $CANAL."

# 3 · Poda: se quedan las $GUARDAR capas más recientes.
gh release view "$CANAL" -R "$REPO" --json assets > "$SALIDA/assets.json"
mkdir -p "$SALIDA/punteros"
leer_punteros() {
  rm -f "$SALIDA"/punteros/*.json
  gh release download "$CANAL" -R "$REPO" -p latest-servidor.json -p latest-servidor-prueba.json -p retiradas.json \
    -D "$SALIDA/punteros" --clobber 2> /dev/null || true
}
leer_punteros
node "$AQUI/capa.mjs" podar --assets "$SALIDA/assets.json" --guardar "$GUARDAR" --dir "$SALIDA/punteros" --salida "$SALIDA/borrar.txt"
while IFS= read -r n; do
  [ -n "$n" ] || continue
  # Se vuelven a leer los punteros justo antes de cada borrado: una promoción en carrera no pierde su build.
  leer_punteros
  if node "$AQUI/capa.mjs" protegido --dir "$SALIDA/punteros" --nombre "$n"; then
    gh release delete-asset "$CANAL" "$n" -R "$REPO" -y || true
  fi
done < "$SALIDA/borrar.txt"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "Canal: https://github.com/$REPO/releases/download/$CANAL/$PUNTERO → $BUILD" >> "$GITHUB_STEP_SUMMARY"
fi
