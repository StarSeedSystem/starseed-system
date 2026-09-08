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

# --- helpers de puerto -------------------------------------------------------
# Pids que ESCUCHAN en $PUERTO. Preferimos lsof (macOS y Linux); si no existe,
# usamos fuser (Linux). Devuelve un pid por línea, solo numéricos y sin duplicados.
# 2026-09-08, Ola 274 · C5: detectar por puerto es lo fiable — el hijo real de
# `next start` se llama `next-server (v15…)` y NO casa con el patrón de la orden,
# así que `pkill -f` no lo encontraba y el puerto seguía ocupado.
pids_del_puerto() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -tiTCP:${PUERTO} -sTCP:LISTEN 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${PUERTO}/tcp" 2>/dev/null || true)
  fi
  printf '%s\n' $pids | grep -E '^[0-9]+$' | sort -u
}

# true si $1 es $$ o alguno de sus ancestros: para no matarnos a nosotros mismos
# al hacer kill sobre una familia de pids del puerto (el script se ejecuta dentro
# del árbol del servidor cuando lo llama la propia API de /api/mando/publicaciones).
es_mio() {
  local pid p
  pid="${1:-}"
  [ "$pid" = "$$" ] && return 0
  p="$$"
  while [ -n "$p" ] && [ "$p" != "0" ] && [ "$p" != "1" ]; do
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d '[:space:]' || true)
    [ "$p" = "$pid" ] && return 0
  done
  return 1
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
  # «Ya está arrancado» se decide por el puerto (no por el patrón de la orden):
  # el listener real es `next-server (v15…)`, que nunca casaría con el patrón.
  local puerto_pids pid es_next
  puerto_pids=$(pids_del_puerto)
  if [ -n "$puerto_pids" ]; then
    # Si el puerto lo sirve un next-server nuestro, está arrancado; si lo ocupa
    # otra cosa, lo decimos con su pid y orden para no enmascarar el conflicto.
    es_next=""
    for pid in $puerto_pids; do
      if ps -o command= -p "$pid" 2>/dev/null | grep -q "next-server"; then
        es_next=1
        break
      fi
    done
    if [ -n "$es_next" ]; then
      echo "Ya está arrancado el modo ligero en :${PUERTO}."
      estado
      return 0
    fi
    echo "⚠️  El puerto :${PUERTO} está ocupado por otro proceso: $(ps -o command= -p $puerto_pids 2>/dev/null | head -n1)" >&2
    exit 1
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
# Apaga de verdad el servidor del puerto. VISTO EN LA MAC (Ola 274 · C5): con solo
# `pkill -f "next start -p 9002"` el hijo real (`next-server`) quedaba vivo, el
# puerto seguía ocupado y `construir` borraba .next bajo el servidor en marcha
# (10 min sirviendo 400 en todos los chunks). Ahora matamos a quien escucha en el
# puerto más su familia y verificamos que el puerto queda libre antes de volver.
parar() {
  local pids todos pid ppid cmd killables
  pids=$(pids_del_puerto)
  todos=$pids
  # Padres del listener cuya orden sea `next start` o `npm exec next` (el wrapper
  # de npx). El propio listener entra por pids_del_puerto.
  for pid in $pids; do
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -n "$ppid" ] && [ "$ppid" != "0" ]; then
      cmd=$(ps -o command= -p "$ppid" 2>/dev/null || true)
      case "$cmd" in
        *"next start"*|*"npm exec next"*) todos="$todos $ppid" ;;
      esac
    fi
  done
  # Los que casen con el patrón de la orden de arranque o con el hijo real.
  todos="$todos $(pgrep -f "$PATRON_START" 2>/dev/null || true)"
  todos="$todos $(pgrep -f "next-server (v" 2>/dev/null || true)"

  # Filtramos: solo numéricos, sin duplicados y nunca nosotros ni nuestros ancestros.
  killables=""
  for pid in $todos; do
    case "$pid" in
      ''|*[!0-9]*) continue ;;
    esac
    if es_mio "$pid"; then continue; fi
    case " $killables " in *" $pid "*) continue ;; esac
    killables="$killables $pid"
  done

  if [ -z "$killables" ]; then
    if [ -z "$pids" ]; then
      # De verdad no había nadie en el puerto: único caso del mensaje «no había».
      echo "No había servidor ligero corriendo en :${PUERTO}."
    else
      echo "❌ El puerto :${PUERTO} lo ocupa un proceso que no es next-server; no lo toco." >&2
      exit 1
    fi
    return 0
  fi

  echo "🛑 Modo ligero detenido (pids:${killables})…"
  # TERM primero (deja responder a las conexiones y cerrar la base); si a los 5 s
  # el puerto sigue ocupado, KILL. Si al final sigue ocupado, salimos con código 1
  # para que `parar && construir && arrancar` se frene y no compile bajo el server.
  kill -TERM $killables 2>/dev/null || true
  local n=0
  while [ -n "$(pids_del_puerto)" ] && [ "$n" -lt 5 ]; do
    sleep 1
    n=$((n+1))
  done
  if [ -n "$(pids_del_puerto)" ]; then
    echo "❌ El puerto :${PUERTO} sigue ocupado tras TERM; forzando KILL…" >&2
    kill -KILL $killables 2>/dev/null || true
    sleep 1
  fi
  if [ -n "$(pids_del_puerto)" ]; then
    echo "❌ No pude liberar :${PUERTO}; interrumpo la cadena (código 1)." >&2
    exit 1
  fi
  echo "✅ Puerto :${PUERTO} libre."
}

# --- estado ------------------------------------------------------------------
# pid, MB de RAM, BUILD_ID, fecha del build y si main trae commits más nuevos.
estado() {
  local pids
  pids=$(pids_del_puerto)
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
    # 2026-09-06, Ola 257: en Apple Silicon la página es de 16384 bytes, no 4096,
    # y vm_stat lo anuncia en su primera línea («page size of 16384 bytes»). Antes
    # fijábamos 4096 a pelo y la RAM libre+inactiva salía 4× menor de lo real
    # (decía 338 MB cuando había ~1,35 GB). Leemos el tamaño de página de esa
    # línea; 4096 como valor por defecto si no se puede leer. Guardamos la salida
    # una sola vez para no llamar a vm_stat tres veces.
    local vm tam_pagina mb_libres
    vm=$(vm_stat 2>/dev/null || true)
    tam_pagina=$(printf '%s\n' "$vm" | sed -nE 's/.*page size of ([0-9]+) bytes.*/\1/p' | tr -d '[:space:]')
    tam_pagina=${tam_pagina:-4096}
    mb_libres=$(printf '%s\n' "$vm" | awk -v p="$tam_pagina" '/Pages free/{f=$3} /Pages inactive/{i=$3} END{gsub(/\./,"",f); gsub(/\./,"",i); printf "%.0f", (f+i)*p/1048576}')
    echo "🧠 RAM libre+inactiva: ${mb_libres} MB (página ${tam_pagina} B)"
  fi
  # Swap usado y total (Ola 257): cuánto está comprimiendo/volcando a disco el
  # sistema. `sysctl vm.swapusage` solo existe en macOS; en Linux se salta con
  # command -v.
  if command -v sysctl >/dev/null 2>&1; then
    # 2026-09-06, Ola 257: `sysctl vm.swapusage` devuelve los valores en MEGABYTES
    # con sufijo y decimales — «used = 3821.31M» — NO en bytes. La Ola 257 (L4,
    # 71fab7b) los trataba como bytes y dividía entre 1048576, así que imprimía
    # «💱 Swap usado: 0 MB» siempre. Capturamos el número y su sufijo (K/M/G) y
    # convertimos a MB redondeando a entero (K → /1024, M → tal cual, G → ×1024).
    # Si no se puede leer, no imprimimos la línea.
    local swap_line swap_used_mb swap_total_mb
    swap_line=$(sysctl vm.swapusage 2>/dev/null || true)
    swap_used_mb=$(printf '%s\n' "$swap_line" | sed -nE 's/.*used = ([0-9.]+)([KMG]).*/\1 \2/p' | awk '{v=$1; s=$2; if(s=="K")v=v/1024; else if(s=="G")v=v*1024; printf "%.0f", v}')
    swap_total_mb=$(printf '%s\n' "$swap_line" | sed -nE 's/.*total = ([0-9.]+)([KMG]).*/\1 \2/p' | awk '{v=$1; s=$2; if(s=="K")v=v/1024; else if(s=="G")v=v*1024; printf "%.0f", v}')
    if [ -n "$swap_used_mb" ]; then
      echo "💱 Swap usado: ${swap_used_mb} MB de ${swap_total_mb:-?} MB"
    fi
  fi
  # Salud de la voz (Ola 257): el demonio OmniVoice vive en 127.0.0.1:4444 y
  # responde /status con 200; el campo "ready" dice si ya cargó sus modelos.
  # Todo con || true: que no esté el demonio no debe hacer fallar el estado.
  local voz_codigo voz_ready
  voz_codigo=$(curl -s -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:4444/status 2>/dev/null || true)
  if [ "$voz_codigo" = "200" ]; then
    voz_ready=$(curl -s -m 3 http://127.0.0.1:4444/status 2>/dev/null | grep -o '"ready":true\|"ready":false' | head -n1 || true)
    if [ "$voz_ready" = '"ready":true' ]; then
      echo "🎙 Demonio de voz: vivo (listo)"
    else
      echo "🎙 Demonio de voz: vivo (cargando)"
    fi
  else
    echo "🎙 Demonio de voz: apagado"
  fi
  # Salud del BitNet 1.58 (Ola 257): /health responde 200 (vivo) o 503 (cargando);
  # sin respuesta, apagado o dormido. Puerto sobrescribible con STARSEED_BITNET_PUERTO.
  local bitnet_puerto bitnet_codigo
  bitnet_puerto="${STARSEED_BITNET_PUERTO:-8790}"
  bitnet_codigo=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${bitnet_puerto}/health" 2>/dev/null || true)
  case "$bitnet_codigo" in
    200) echo "🧠 BitNet 1.58: vivo" ;;
    503) echo "🧠 BitNet 1.58: cargando" ;;
    *)   echo "🧠 BitNet 1.58: apagado o dormido" ;;
  esac
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
