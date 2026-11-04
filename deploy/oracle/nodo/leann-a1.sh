#!/bin/bash
# StarSeed · LEANN (recuerdo semántico) en el A1 de Oracle. Idempotente, como ollama-a1.sh.
#
# POR QUÉ (LNN1028C; Alex, 2026-10-28: «todos deben ser fusionados»): LEANN (StarTrail-org, MIT)
# es el recuerdo por SIGNIFICADO de Astraura (architecture/leann-recuerdo-semantico.md). En la Mac
# no cabe (~1,5–2 GB con torch); en el A1 sí (16 GB de disco, Python 3.12). Lo sirve
# starseed-leann.service en 127.0.0.1:4495 con token (leann_servidor.py propio, nunca el servidor
# HTTP de LEANN porque no autentica ni filtra); sin él, el recuerdo sigue con Memvid y nada falla.
# Fijado leann==0.3.8 (la Biblioteca decide la subida cuando haya etiqueta y pasen las pruebas).
#
# MODELO de incrustaciones: qwen3-embedding:0.6b por Ollama, Apache-2.0 (comprobado ANTES de
# dejarlo); solo ese modelo cargado (OLLAMA_MAX_LOADED_MODELS=1) y OLLAMA_KEEP_ALIVE=2m en el
# servicio de Ollama: se carga solo al construir o buscar, y se va a los 2 minutos.
#
# USO (en el A1): sudo bash /opt/starseed/nodo/leann-a1.sh
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
VENV=/opt/starseed/leann/.venv
MODELO=qwen3-embedding:0.6b
OLLAMA_SH="$DIR/ollama-a1.sh"
[ -f "$OLLAMA_SH" ] || OLLAMA_SH=/opt/starseed/nodo/ollama-a1.sh
# 1) Ollama y el modelo: instala o actualiza (ollama-a1.sh es idempotente).
bash "$OLLAMA_SH" "$MODELO"
# 2) La licencia ANTES de darlo por bueno: nada no comercial (contrato §6 de las capas).
if ! ollama show "$MODELO" --license 2>/dev/null | grep -q 'Apache License'; then
  echo "$MODELO: la licencia no es Apache-2.0: NO queda instalado. Revísala a mano."
  exit 3
fi
# 3) El venv del usuario del servicio con leann fijado (solo si hace falta: ~1,5–2 GB).
sudo install -d -o starseed -g starseed /opt/starseed/leann
if ! sudo -u starseed "$VENV/bin/python" -m pip show leann 2>/dev/null | grep -Fq 'Version: 0.3.8'; then
  [ -x "$VENV/bin/python" ] || sudo -u starseed python3 -m venv "$VENV"
  sudo -u starseed "$VENV/bin/python" -m pip install --no-cache-dir 'leann==0.3.8'
fi
# 4) El entorno de Ollama que LEANN necesita (otro drop-in, alfabéticamente después de
# starseed.conf, así sus valores ganan sobre el KEEP_ALIVE=5m de ollama-a1.sh).
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/zz-leann.conf >/dev/null <<'CONF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=2m"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
CONF
sudo systemctl daemon-reload
sudo systemctl restart ollama
echo "leann 0.3.8 en $VENV · $MODELO con OLLAMA_KEEP_ALIVE=2m · listo para starseed-leann.service"
