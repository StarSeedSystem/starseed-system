#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Motor de Voz Astraura (StarSeed OS) · Instalador WEB de una línea
#
#   curl -fsSL https://raw.githubusercontent.com/StarSeedSystem/starseed-system/main/native/astraura-voice/web-install.sh | bash
#
# Qué hace (transparente, sin sorpresas):
#   1. Comprueba Node 18+, git y cmake (te dice cómo conseguirlos si faltan).
#   2. Descarga SOLO la carpeta native/astraura-voice del repo público.
#   3. Ejecuta install.mjs: sondea tu hardware, compila omnivoice.cpp con el
#      backend adecuado (Metal/Vulkan/CPU), descarga ÚNICAMENTE la variante de
#      modelo que tu equipo puede mover (BF16 / Q8_0 / Q4_K_M) e instala el
#      daemon como servicio de usuario (launchd en macOS · systemd en Linux).
#
# Permisos y privacidad:
#   · El daemon escucha SOLO en 127.0.0.1:4444 (jamás expuesto a la red).
#   · CORS estricto: únicamente el ecosistema StarSeed OS puede hablarle.
#   · Se inicia con tu sesión de usuario; se duerme solo tras 10 min sin uso.
#   · Todo el procesamiento de voz ocurre EN tu dispositivo (privacidad total).
#   · Desinstalar: node install.mjs --uninstall  (o borra ~/.starseed/astraura-voice)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

say() { printf '\033[1;36m◆ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Necesitas Node.js 18+ → https://nodejs.org (o: brew install node / apt install nodejs)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node $NODE_MAJOR detectado; se necesita 18+."
command -v git >/dev/null 2>&1 || die "Necesitas git (macOS: xcode-select --install · Linux: apt install git)"
if ! command -v cmake >/dev/null 2>&1; then
  say "cmake no encontrado — necesario para compilar el motor."
  if command -v brew >/dev/null 2>&1; then
    say "Instalando cmake con Homebrew…"
    brew install cmake
  elif command -v apt-get >/dev/null 2>&1; then
    say "Instalando cmake con apt…"
    sudo apt-get install -y cmake
  else
    die "Instala cmake y reintenta (https://cmake.org/download)."
  fi
fi

SRC="${HOME}/.starseed/astraura-voice-src"
say "Descargando el instalador en ${SRC}…"
rm -rf "$SRC"
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/StarSeedSystem/starseed-system.git "$SRC"
cd "$SRC"
git sparse-checkout set native/astraura-voice
cd native/astraura-voice

say "Sondeando hardware e instalando (esto compila y descarga el modelo justo)…"
node install.mjs "$@"

say "Listo. Comprueba el motor:  curl http://127.0.0.1:4444/status"
say "La web (starseed-os.vercel.app) lo detectará sola en el próximo uso de voz."
