#!/bin/sh
# ============================================================================
# install.sh — Instalador del servidor de cerebro de StarSeed para VPS / local
# ----------------------------------------------------------------------------
# Pensado para un VPS recién creado (Hostinger / Ubuntu / Debian) o tu equipo.
# Es idempotente y seguro: se puede ejecutar varias veces sin romper nada.
#
# Uso rápido (una sola línea):
#   bash <(curl -s https://starseed-os.vercel.app/brain/install.sh)
#
# Con IA libre (instala también Ollama):
#   bash <(curl -s https://starseed-os.vercel.app/brain/install.sh) --with-ollama
#
# Opciones:
#   --with-ollama   Instala Ollama (LLM open-source) y descarga el modelo.
#   --no-run        Solo instala/descarga; no arranca el servidor.
#   --help          Muestra esta ayuda.
#
# Variables de entorno (opcionales):
#   PORT          Puerto del servidor (por defecto 8800).
#   HOST          Interfaz de escucha (por defecto 0.0.0.0, válido en VPS).
#   OLLAMA_MODEL  Modelo de Ollama a descargar/usar (por defecto llama3).
#   INSTALL_DIR   Carpeta de instalación (por defecto ./starseed-brain).
# ============================================================================

set -e  # aborta a la primera de cambio si algo falla

# --- Configuración (puedes sobrescribir con variables de entorno) -----------
BRAIN_URL="https://starseed-os.vercel.app/brain/local_brain.py"
INSTALL_DIR="${INSTALL_DIR:-$(pwd)/starseed-brain}"
PORT="${PORT:-8800}"
HOST="${HOST:-0.0.0.0}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3}"

WITH_OLLAMA=0
DO_RUN=1

# --- Procesar argumentos ----------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --with-ollama) WITH_OLLAMA=1 ;;
    --no-run)      DO_RUN=0 ;;
    --help|-h)
      sed -n '2,30p' "$0" 2>/dev/null || echo "Consulta los comentarios de install.sh"
      exit 0
      ;;
    *) echo "Opción desconocida: $arg (usa --help)"; exit 1 ;;
  esac
done

echo "==> StarSeed · instalador del servidor de cerebro"

# --- 1) Comprobar python3 ---------------------------------------------------
# El servidor solo necesita Python 3 (biblioteca estándar, sin dependencias).
if command -v python3 >/dev/null 2>&1; then
  echo "    python3 detectado: $(python3 --version 2>&1)"
else
  echo "!!! No se encontro python3. Instalalo y vuelve a ejecutar:"
  echo "    Ubuntu/Debian:  sudo apt update && sudo apt install -y python3"
  echo "    Fedora:         sudo dnf install -y python3"
  exit 1
fi

# --- 2) Descargar local_brain.py --------------------------------------------
mkdir -p "$INSTALL_DIR"
echo "==> Descargando local_brain.py en $INSTALL_DIR"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BRAIN_URL" -o "$INSTALL_DIR/local_brain.py"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$INSTALL_DIR/local_brain.py" "$BRAIN_URL"
else
  echo "!!! Necesito curl o wget para descargar el servidor."
  exit 1
fi
echo "    OK: $INSTALL_DIR/local_brain.py"

# --- 3) (Opcional) Instalar Ollama (IA libre) -------------------------------
if [ "$WITH_OLLAMA" -eq 1 ]; then
  if command -v ollama >/dev/null 2>&1; then
    echo "==> Ollama ya esta instalado: $(ollama --version 2>&1 | head -n1)"
  else
    echo "==> Instalando Ollama (LLM open-source) desde ollama.com"
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  # Descargar el modelo (idempotente: si ya esta, Ollama no lo vuelve a bajar).
  echo "==> Descargando el modelo '$OLLAMA_MODEL' (puede tardar)"
  ollama pull "$OLLAMA_MODEL" || echo "    (aviso) no se pudo descargar el modelo ahora; hazlo luego con: ollama pull $OLLAMA_MODEL"
  # Hook que usa local_brain.py para hablar con Ollama.
  export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
  export OLLAMA_MODEL
  echo "    IA libre activada: OLLAMA_URL=$OLLAMA_URL · modelo=$OLLAMA_MODEL"
fi

# --- 4) Recordatorio: abrir el puerto en el firewall del VPS -----------------
echo "==> IMPORTANTE: abre el puerto $PORT en tu VPS para acceder desde fuera."
echo "    Con ufw (Ubuntu):  sudo ufw allow ${PORT}/tcp"
echo "    En Hostinger, abre tambien el puerto en el panel/firewall del VPS."

# --- 5) Arrancar el servidor ------------------------------------------------
if [ "$DO_RUN" -eq 1 ]; then
  # Intentar detectar la IP publica para mostrar la URL a registrar.
  IP="$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  echo ""
  echo "============================================================"
  echo " Arrancando el servidor de cerebro..."
  echo " Registralo en StarSeed -> Servidores con la URL:"
  if [ -n "$IP" ]; then
    echo "     http://$IP:$PORT      (desde otros equipos / la nube)"
  fi
  echo "     http://localhost:$PORT  (si lo usas en local)"
  echo "============================================================"
  echo ""
  export HOST PORT
  exec python3 "$INSTALL_DIR/local_brain.py"
else
  echo "==> Instalacion completada (--no-run). Arrancalo cuando quieras con:"
  echo "    HOST=$HOST PORT=$PORT python3 $INSTALL_DIR/local_brain.py"
fi
