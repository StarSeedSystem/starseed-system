#!/usr/bin/env bash
#
# starseed-ligero.sh — Modo ligero del OS en la Mac de 8 GB (voz neuronal + Astraura 1.58)
#
# ¿Por qué? (2026-09-06, verificado en la Mac de Alex) — El servidor de desarrollo
# (`next dev --turbopack -p 9002`) crece a 3-5 GB de RAM. Sumando el backend Astraura
# 1.58 (1,2 GB), el demonio de voz OmniVoice (~900 MB por tts-server), Ollama (1,16 GB)
# y la app de Claude, la Mac se queda con ~60 MB libres: el tts-server no llega a
# responder /health y VibeASR.cpp corre a RTF 13 en vez de ~0,5.
#
# La solución: servir el OS COMPILADO (`next build` + `next start`), que consume una
# fracción de la memoria del modo desarrollo, dejando aire para la voz y el 1.58.
# Las rutas de servidor (/api/mando/*, /api/ai/*, /api/voz-local/*) funcionan igual.
#
# Uso:
#   scripts/starseed-ligero.sh construir [--limpiar]  # compila producción (.next) con log en /tmp;
#                                                     # --limpiar borra cachés regenerables antes
#   scripts/starseed-ligero.sh arrancar   # sirve en :9002 (construye si hace falta)
#   scripts/starseed-ligero.sh parar       # detiene el servidor ligero
#   scripts/starseed-ligero.sh estado      # pid, MB, disco/RAM libres, vigilante y si va viejo
#   scripts/starseed-ligero.sh dev         # vuelve al modo desarrollo (turbopack)
#
# Variables de entorno opcionales:
#   STARSEED_BUILD_HEAP_MB  Heap de Node para el build (defecto 4096; 2026-09-06: 2048 se
#                           queda sin heap en este repo — «JavaScript heap out of memory»).
#   STARSEED_DISCO_MIN_GB   GB libres mínimos para compilar (defecto 4; el build necesita
#                           ~2 GB para .next más caché y un ENOSPC a mitad deja .next roto).
#
# Nunca usa sudo. Todo vive en el usuario actual.

set -euo pipefail

# Raíz del repositorio: respeta STARSEED_ROOT si el orquestador la define.
REPO="${STARSEED_ROOT:-$HOME/Documents/starseed-os-main}"
PUERTO=9002
LOG_BUILD=/tmp/starseed-ligero-build.log
LOG_SERVER=/tmp/starseed-ligero.log

# Vigilante launchd del dev server: si está cargado relanza `next dev` solo y se pelea
# con el modo ligero por el puerto y la RAM; hay que descargarlo antes de compilar/
# arrancar y recargarlo al volver a `dev` (2026-09-06: se hacía a mano).
PLIST_VIGILANTE="$HOME/Library/LaunchAgents/com.starseed.dev-vigilante.plist"
ETIQUETA_VIGILANTE="com.starseed.dev-vigilante"

# Patrón del proceso de desarrollo / producción en este puerto (para pkill/pgrep).
PATRON_DEV="bin/next dev --turbopack -p ${PUERTO}"
PATRON_START="next start -p ${PUERTO}"

# --- helpers de vigilante (solo macOS; en Linux se saltan solos) ---------------
descargar_vigilante() {
  # Sin launchctl (Linux) no hay nada que hacer.
  command -v launchctl >/dev/null 2>&1 || return 0
  if [ -f "$PLIST_VIGILANTE" ] && launchctl list 2>/dev/null | grep -q "$ETIQUETA_VIGILANTE"; then
    launchctl unload "$PLIST_VIGILANTE" 2>/dev/null || true
    echo "⏸  Vigilante del dev server ($ETIQUETA_VIGILANTE) descargado para que no lo relance."
  fi
}

cargar_vigilante() {
  command -v launchctl >/dev/null 2>&1 || return 0
  if [ -f "$PLIST_VIGILANTE" ] && ! launchctl list 2>/dev/null | grep -q "$ETIQUETA_VIGILANTE"; then
    launchctl load "$PLIST_VIGILANTE" 2>/dev/null || true
    echo "▶️  Vigilante del dev server ($ETIQUETA_VIGILANTE) recargado."
  fi
}

# --- helpers de disco ---------------------------------------------------------
# GB libres en la partición del repo (df -k funciona igual en macOS y Linux).
gb_libres() {
  # `|| true` por set -e + pipefail: si la ruta no existe no queremos morir en silencio.
  { df -k "$REPO" 2>/dev/null || true; } | awk 'NR==2{printf "%.1f", $4/1048576}'
}

comprobar_disco() {
  local limpiar="${1:-}"
  local min="${STARSEED_DISCO_MIN_GB:-4}"
  if [ "$limpiar" = "--limpiar" ]; then
    # Solo cosas regenerables: nunca se pierde trabajo.
    echo "🧹 Limpiando cachés regenerables (.next, caché de npm, cachés de GitNexus)…"
    rm -rf "$REPO/.next" "$REPO/.gitnexus/parse-cache" "$REPO/.gitnexus/parsedfile-cache"
    npm cache clean --force >/dev/null 2>&1 || true
  fi
  local libres
  libres=$(gb_libres)
  if ! awk -v l="$libres" -v m="$min" 'BEGIN{exit !(l+0 >= m+0)}'; then
    {
      echo "❌ Disco casi lleno: ${libres} GB libres (mínimo ${min} GB; el build necesita ~2 GB)."
      echo "   Cosas regenerables que puedes borrar sin perder nada:"
      echo "   · $REPO/.next (build anterior; se reconstruye)"
      echo "   · npm cache clean --force"
      echo "   · $REPO/.gitnexus/parse-cache y parsedfile-cache (se regeneran)"
      echo "   · $REPO/.transfer/*.bundle ya integrados"
      echo "   O vuelve a intentarlo con: $0 construir --limpiar"
    } >&2
    exit 3
  fi
  echo "💾 Disco: ${libres} GB libres (mínimo ${min} GB)."
}

# --- construir -------------------------------------------------------------
# Para el dev server si corre (libera 3-5 GB antes de compilar, que también pica)
# y compila producción con un tope de heap razonable para una Mac de 8 GB.
construir() {
  comprobar_disco "${1:-}"
  descargar_vigilante
  if pgrep -f "$PATRON_DEV" >/dev/null 2>&1; then
    echo "⏸  Parando el servidor de desarrollo para liberar memoria…"
    pkill -f "$PATRON_DEV" || true
    sleep 2
  fi
  echo "🔨 Compilando el OS en modo producción (log: $LOG_BUILD)…"
  # 2026-09-06: con 2048 MB el build muere por heap («JavaScript heap out of memory»);
  # 4096 compila bien en la Mac de 8 GB. Sobrescribible con STARSEED_BUILD_HEAP_MB.
  export NODE_OPTIONS="--max-old-space-size=${STARSEED_BUILD_HEAP_MB:-4096}"
  export NEXT_TELEMETRY_DISABLED=1
  if (cd "$REPO" && npx next build >"$LOG_BUILD" 2>&1); then
    # Guardamos el commit compilado para que `estado` avise si el build va viejo.
    (cd "$REPO" && git rev-parse --short HEAD > .next/starseed-build-commit)
    echo "✅ Build listo: $(cat "$REPO/.next/BUILD_ID") @ $(cat "$REPO/.next/starseed-build-commit")"
  else
    echo "❌ Falló el build. Últimos 20 renglones del log:" >&2
    tail -n 20 "$LOG_BUILD" >&2
    if grep -q "ENOSPC" "$LOG_BUILD"; then
      echo "❌ Disco lleno (ENOSPC): $(gb_libres) GB libres; prueba \`$0 construir --limpiar\`." >&2
    fi
    exit 1
  fi
}

# --- arrancar ----------------------------------------------------------------
# Lanza `next start` desacoplado (nohup) y espera a que responda 200/307.
arrancar() {
  descargar_vigilante
  if [ ! -f "$REPO/.next/BUILD_ID" ]; then
    echo "No hay build de producción; compilando primero…"
    construir
  fi
  if pgrep -f "$PATRON_START" >/dev/null 2>&1; then
    echo "Ya está arrancado el modo ligero en :${PUERTO}."
    estado
    return 0
  fi
  echo "🚀 Sirviendo el OS compilado en http://localhost:${PUERTO} (log: $LOG_SERVER)…"
  # STARSEED_MANDO=1 abre las rutas /api/mando/* en esta instancia producción y
  # STARSEED_LOCAL=1 marca el despliegue como propio de la neurona: así la voz y
  # el Puente de Mando funcionan SIN sesión en localhost (Ola 253 · 2026-09-06).
  # Antes, el modo ligero devolvía «La consola está apagada» o 401 en /api/mando/*.
  # Se guardan en /tmp/starseed-ligero.env para que `estado` pueda enseñarlas.
  cat > /tmp/starseed-ligero.env <<EOF_ENV
STARSEED_MANDO=1
STARSEED_LOCAL=1
EOF_ENV
  (cd "$REPO" && NODE_ENV=production PORT=$PUERTO STARSEED_MANDO=1 STARSEED_LOCAL=1 nohup npx next start -p "$PUERTO" >"$LOG_SERVER" 2>&1 &)
  # Espera activa hasta 60 s: la primera carga puede tardar unos segundos.
  local codigo=""
  for _ in $(seq 1 60); do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PUERTO}/" || true)
    if [ "$codigo" = "200" ] || [ "$codigo" = "307" ]; then
      break
    fi
    sleep 1
  done
  if [ "$codigo" = "200" ] || [ "$codigo" = "307" ]; then
    estado
    echo "✅ Modo ligero activo (HTTP $codigo). Voz y 1.58 tienen aire ahora."
  else
    echo "❌ No respondió en 60 s. Revisa $LOG_SERVER" >&2
    tail -n 20 "$LOG_SERVER" >&2 || true
    exit 1
  fi
}

# --- parar -------------------------------------------------------------------
parar() {
  if pkill -f "$PATRON_START" 2>/dev/null; then
    echo "🛑 Modo ligero detenido."
  else
    echo "No había servidor ligero corriendo en :${PUERTO}."
  fi
}

# --- estado ------------------------------------------------------------------
# pid, MB de RAM, BUILD_ID, fecha del build y si main trae commits más nuevos.
estado() {
  local pids
  pids=$(pgrep -f "$PATRON_START" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      # rss en KB → MB
      local mb
      mb=$(ps -o rss= -p "$pid" 2>/dev/null | awk '{printf "%.0f", $1/1024}' || echo "?")
      echo "🟢 pid $pid · ${mb} MB · http://localhost:${PUERTO}"
    done
    # Variables con las que arrancó (guardadas por `arrancar`): si falta el Mando
    # o el modo local del despliegue, la voz y la consola pedirían sesión.
    if [ -f /tmp/starseed-ligero.env ]; then
      echo "🔧 Entorno del arranque: $(tr '\n' ' ' < /tmp/starseed-ligero.env | sed 's/ $//')"
    else
      echo "⚠️  Sin /tmp/starseed-ligero.env: arrancó sin STARSEED_MANDO=1 ni STARSEED_LOCAL=1. Relanza con: $0 arrancar"
    fi
  else
    echo "⚪ Modo ligero NO está corriendo en :${PUERTO}."
  fi
  if [ -f "$REPO/.next/BUILD_ID" ]; then
    local fecha commit_build commit_head
    fecha=$(stat -f '%Sm' "$REPO/.next/BUILD_ID" 2>/dev/null || stat -c '%y' "$REPO/.next/BUILD_ID" 2>/dev/null || echo "?")
    commit_build=$(cat "$REPO/.next/starseed-build-commit" 2>/dev/null || echo "?")
    commit_head=$(cd "$REPO" && git rev-parse --short HEAD 2>/dev/null || echo "?")
    echo "📦 Build: $(cat "$REPO/.next/BUILD_ID") · compilado: $fecha · commit del build: $commit_build"
    if [ "$commit_build" != "$commit_head" ]; then
      echo "⚠️  main va más nuevo ($commit_head): hay commits posteriores al build. Ejecuta: $0 construir"
    fi
  else
    echo "📦 Sin build de producción todavía."
  fi
  # Recursos del sistema: disco libre en la partición del repo y RAM recuperable
  # (páginas free + inactive; vm_stat solo existe en macOS, en Linux se salta).
  echo "💾 Disco libre: $(gb_libres) GB"
  if command -v vm_stat >/dev/null 2>&1; then
    local mb_libres
    mb_libres=$(vm_stat | awk '/Pages free/{f=$3} /Pages inactive/{i=$3} END{gsub(/\./,"",f); gsub(/\./,"",i); printf "%.0f", (f+i)*4096/1048576}')
    echo "🧠 RAM libre+inactiva: ${mb_libres} MB"
  fi
  if command -v launchctl >/dev/null 2>&1; then
    if [ -f "$PLIST_VIGILANTE" ] && launchctl list 2>/dev/null | grep -q "$ETIQUETA_VIGILANTE"; then
      echo "👁  Vigilante del dev server: cargado (relanzará next dev si muere)."
    else
      echo "👁  Vigilante del dev server: NO cargado."
    fi
  fi
}

# --- dev ---------------------------------------------------------------------
# Vuelve al modo desarrollo (recarga en vivo) una vez terminadas las pruebas.
dev() {
  parar
  # Recargamos el vigilante de launchd para que cuide el dev server otra vez.
  cargar_vigilante
  if [ -x "$HOME/.local/bin/starseed-dev" ]; then
    echo "🔄 Relanzando desarrollo con starseed-dev…"
    "$HOME/.local/bin/starseed-dev" reiniciar
  else
    echo "🔄 Relanzando desarrollo con next dev (turbopack) en :${PUERTO}…"
    (cd "$REPO" && nohup npx next dev --turbopack -p "$PUERTO" >/tmp/starseed-dev.log 2>&1 &)
    echo "Log: /tmp/starseed-dev.log"
  fi
}

# --- entrada -----------------------------------------------------------------
case "${1:-}" in
  construir) construir "${2:-}" ;;
  arrancar)  arrancar ;;
  parar)     parar ;;
  estado)    estado ;;
  dev)       dev ;;
  *)
    echo "Uso: $0 {construir [--limpiar]|arrancar|parar|estado|dev}" >&2
    exit 2
    ;;
esac
