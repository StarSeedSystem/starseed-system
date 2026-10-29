#!/usr/bin/env bash
# ============================================================================
# StarSeed OS · Empaquetado de la PWA para Meta Quest (tarea XR1010AH)
#
# Encadena los pasos documentados por Meta en la página «PWA packaging»
# (actualizada 2026-07-22): inicializar el proyecto Bubblewrap, ver la
# huella SHA-256 del almacén de claves, añadirla, compilar y, si hay visor
# conectado, instalarlo con adb.
#
# TODO se lee del ENTORNO, nunca de archivos:
#   STARSEED_QUEST_MANIFEST_URL  (por defecto el manifest publicado)
#   STARSEED_QUEST_PACKAGE       (OBLIGATORIA: id del paquete, p. ej. app.starseed.os.xr)
#   STARSEED_QUEST_MODE          («immersive» o «2D»; por defecto immersive)
#   STARSEED_QUEST_KEYSTORE      (ruta del almacén de claves de Alex)
#   STARSEED_QUEST_SHA256        (huella SHA-256, la da keytool: ver más abajo)
#
# Las contraseñas de la clave NUNCA se pasan por argumento ni se escriben:
# Bubblewrap las pregunta de forma interactiva cuando hace falta.
#
# Subir el APK a la Horizon Store es decisión y cuenta de Alex (contrato
# arquitecture/starseed-xr.md §1.4); este script solo prepara el paquete.
# ============================================================================

set -euo pipefail

ayuda() {
  cat <<EOF
Empaqueta la PWA de StarSeed OS en un APK para Meta Quest.

Uso:
  bash scripts/xr/empaquetar-quest.sh            # flujo completo
  bash scripts/xr/empaquetar-quest.sh --ayuda    # esta ayuda

Variables del entorno:
  STARSEED_QUEST_MANIFEST_URL  URL del manifest (por defecto
                               https://starseed-os.vercel.app/manifest.webmanifest)
  STARSEED_QUEST_PACKAGE       OBLIGATORIA. Id del paquete, único para siempre
                               (p. ej. app.starseed.os.xr)
  STARSEED_QUEST_MODE          «immersive» (abre directo a WebXR) o «2D»
                               (ventana). Por defecto: immersive
  STARSEED_QUEST_KEYSTORE      Ruta del almacén de claves (.keystore)
  STARSEED_QUEST_SHA256        Huella SHA-256 para bubblewrap fingerprint add

Recordatorio final: el APK inmersivo no arranca sin
https://starseed-os.vercel.app/.well-known/assetlinks.json
(lo genera Bubblewrap y debe servirse en esa ruta exacta).
EOF
}

main() {
  # ---------------------------------------------------------------- paso 0: entorno
  local MANIFEST_URL="${STARSEED_QUEST_MANIFEST_URL:-https://starseed-os.vercel.app/manifest.webmanifest}"
  local MODO="${STARSEED_QUEST_MODE:-immersive}"

  if [ -z "${STARSEED_QUEST_PACKAGE:-}" ]; then
    echo "ERROR: falta STARSEED_QUEST_PACKAGE en el entorno." >&2
    echo "Es el id del paquete, único para siempre (p. ej. app.starseed.os.xr)." >&2
    echo "Ejecuta: STARSEED_QUEST_PACKAGE=app.starseed.os.xr bash scripts/xr/empaquetar-quest.sh" >&2
    exit 2
  fi

  if [ "$MODO" != "immersive" ] && [ "$MODO" != "2D" ]; then
    echo "ERROR: STARSEED_QUEST_MODE debe ser «immersive» o «2D» (recibido: $MODO)." >&2
    exit 2
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: hace falta Node en el PATH." >&2
    exit 2
  fi
  # Node ≥ 18 lo exige Bubblewrap (página «PWA packaging», 2026-07-22).
  local NODO_MAYOR
  NODO_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$NODO_MAYOR" -lt 18 ]; then
    echo "ERROR: hace falta Node >= 18 (instalado: $(node --version))." >&2
    exit 2
  fi

  # ---------------------------------------------------------------- paso 1: Bubblewrap
  # Se instala solo si falta, y siempre la versión exacta 1.24.1.
  if ! command -v bubblewrap >/dev/null 2>&1; then
    echo "Instalando @meta-quest/bubblewrap-cli@1.24.1 (solo la primera vez)…"
    npm install --global @meta-quest/bubblewrap-cli@1.24.1
  fi

  # ---------------------------------------------------------------- paso 2: init
  echo "Iniciando el proyecto Bubblewrap desde el manifest $MANIFEST_URL (modo $MODO)…"
  echo "Nota: Bubblewrap preguntará todo lo que falte de forma interactiva."
  echo "Para el modo inmersivo responde horizonOSAppMode = $MODO cuando lo pida."
  bubblewrap init --manifest="$MANIFEST_URL" --metaquest

  # ---------------------------------------------------------------- paso 3: huella SHA-256
  # Se IMPRIME el comando (no se ejecuta a ciegas): la salida es la que sube
  # a assetlinks.json. Requiere STARSEED_QUEST_KEYSTORE en el entorno.
  if [ -n "${STARSEED_QUEST_KEYSTORE:-}" ]; then
    echo
    echo "Para ver la huella SHA-256 del almacén de claves, ejecuta:"
    echo "  keytool -list -v -keystore \"$STARSEED_QUEST_KEYSTORE\" -alias android"
    echo
    if [ -n "${STARSEED_QUEST_SHA256:-}" ]; then
      echo "Añadiendo la huella al proyecto Bubblewrap…"
      bubblewrap fingerprint add "$STARSEED_QUEST_SHA256"
    else
      echo "Sin STARSEED_QUEST_SHA256: salto bubblewrap fingerprint add."
      echo "Sin la huella, el paquete inmersivo puede no arrancar (assetlinks.json)."
    fi
  else
    echo "Sin STARSEED_QUEST_KEYSTORE: no puedo mostrarte el comando keytool."
    echo "Defínela con la ruta de tu almacén (.keystore) y vuelve a ejecutar."
  fi

  # ---------------------------------------------------------------- paso 4: build
  echo "Compilando el APK con Bubblewrap…"
  bubblewrap build

  _instalar_si_hay_visor
  _recordar_assetlinks
}

# ------------------------------------------------------------------ paso 5: adb
# Si hay un visor conectado, instala el APK firmado que acabamos de generar.
# La lógica vive en una función propia para que se lea sola.
_instalar_si_hay_visor() {
  command -v adb >/dev/null 2>&1 || { echo "Sin adb en el PATH: salto la instalación."; return 0; }
  local VISOR
  VISOR="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
  if [ -z "$VISOR" ]; then
    echo "Sin visor conectado: salto adb install. Conéctalo por USB y activa el modo desarrollador."
    return 0
  fi
  echo "Visor conectado ($VISOR). Instalando app-release-signed.apk…"
  adb install app-release-signed.apk
  echo "Ábrelo desde «Orígenes desconocidos» de la biblioteca del visor."
}

_recordar_assetlinks() {
  echo
  echo "=== Recordatorio obligatorio ==="
  echo "El APK inmersivo no arranca si falla la verificación de la app:"
  echo "Bubblewrap genera assetlinks.json y debe servirse en la ruta exacta"
  echo "  /.well-known/assetlinks.json"
  echo "de https://starseed-os.vercel.app — NADIE lo inventa por ti: cópialo"
  echo "tal cual al repositorio público y despliega."
  echo "=== Subirlo a la Horizon Store lo decide Alex (contrato §1.4). ==="
}

case "${1:-}" in
  --ayuda|-h|--help) ayuda ;;
  *) main "$@" ;;
esac
