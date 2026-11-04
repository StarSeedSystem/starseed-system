#!/bin/bash
# StarSeed · LEANN en el A1 de Oracle (Always Free), SOLO en 127.0.0.1:4495. Idempotente.
#
# POR QUÉ (2026-10-28, Alex): LEANN (StarTrail-org/LEANN, MIT) es el recuerdo semántico de
# Astraura: búsqueda por significado en las cápsulas Memvid y en los archivos de memoria, y un
# índice del repo para los agentes. Corre SOLO en el A1 (en la Mac no cabe: ~1,5–2 GB de torch);
# sin el servidor, el recuerdo sigue con Memvid y nada falla.
# Contrato: architecture/leann-recuerdo-semantico.md §2 y §3.
# API: integraciones-de-codigo/leann/README-starseed.md.
#
# Hace, en orden y sin repetir lo hecho:
#   1. baja qwen3-embedding:0.6b con ollama-a1.sh y comprueba su licencia APACHE-2.0 ANTES de
#      dejarlo instalado (si no lo es, lo quita y falla);
#   2. deja Ollama con un solo modelo cargado y OLLAMA_KEEP_ALIVE=2m (LEANN solo lo enciende al
#      construir o buscar);
#   3. crea /opt/starseed/leann/.venv con leann==0.3.8 (fijado; lo sube la Biblioteca cuando
#      haya etiqueta nueva y pasen las pruebas);
#   4. instala y arranca starseed-leann.service (usuario starseed, MemoryMax=1500M, Nice=10).
#
# Uso (en el A1, como ubuntu): bash leann-a1.sh
# Nada se abre a internet y ninguna clave entra aquí: el token lo crea el propio servidor en
# ~/.starseed/leann.token (0600) y no sale de la máquina.
set -euo pipefail

MODELO="qwen3-embedding:0.6b"
VENV="/opt/starseed/leann/.venv"
PY="$VENV/bin/python"
AQUI="$(cd "$(dirname "$0")" && pwd)"
UNIDAD="$AQUI/systemd/starseed-leann.service"
ORDEN_OLLAMA="$AQUI/ollama-a1.sh"
CONF_OLLAMA="/etc/systemd/system/ollama.service.d/zz-leann.conf"

paso() { echo "[leann] $*"; }

paso "modelo de incrustaciones $MODELO (639 MB, más de 100 idiomas)"
if ! command -v ollama >/dev/null 2>&1 || ! ollama show "$MODELO" >/dev/null 2>&1; then
  bash "$ORDEN_OLLAMA" "$MODELO"
fi
LICENCIA="$(ollama show "$MODELO" --license 2>/dev/null | grep -m1 -o -E 'Apache License|MIT License' || true)"
if [ "$LICENCIA" != "Apache License" ]; then
  paso "licencia NO Apache-2.0 (${LICENCIA:-sin licencia legible}): quito $MODELO y no lo dejo"
  ollama rm "$MODELO" >/dev/null 2>&1 || true
  exit 1
fi
paso "$MODELO · licencia: Apache-2.0"

paso "entorno de Ollama: un modelo cargado y 2 min de vida"
NUEVO_CONF='[Service]
Environment="OLLAMA_KEEP_ALIVE=2m"
Environment="OLLAMA_MAX_LOADED_MODELS=1"'
if [ "$(sudo cat "$CONF_OLLAMA" 2>/dev/null || true)" != "$NUEVO_CONF" ]; then
  sudo mkdir -p "$(dirname "$CONF_OLLAMA")"
  printf '%s\n' "$NUEVO_CONF" | sudo tee "$CONF_OLLAMA" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl restart ollama
fi

paso "entorno de Python en $VENV con leann==0.3.8"
if [ ! -x "$PY" ]; then
  sudo mkdir -p /opt/starseed/leann
  sudo python3 -m venv "$VENV"
fi
if ! sudo "$PY" -m pip show leann 2>/dev/null | grep -q '^Version: 0\.3\.8$'; then
  sudo "$PY" -m pip install --no-cache-dir --quiet "leann==0.3.8"
fi
sudo install -d -o starseed -g starseed -m 750 /var/lib/starseed/leann

paso "servicio starseed-leann en 127.0.0.1:4495"
if [ -f "$UNIDAD" ]; then
  sudo install -m 644 "$UNIDAD" /etc/systemd/system/starseed-leann.service
  sudo systemctl daemon-reload
  sudo systemctl enable starseed-leann >/dev/null 2>&1 || true
  if ! sudo systemctl restart starseed-leann; then
    paso "starseed-leann no arrancó: revisa journalctl -u starseed-leann"
    exit 1
  fi
  paso "starseed-leann.service vivo (token en ~/.starseed/leann.token)"
else
  paso "sin unidad en $UNIDAD: no arranco el servicio"
fi

paso "listo: $("$PY" -m pip show leann 2>/dev/null | sed -n 's/^Version: //p') · $MODELO Apache-2.0"
