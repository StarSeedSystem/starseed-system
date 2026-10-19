#!/bin/bash
# StarSeed · Ollama en el A1 de Oracle (Always Free), SOLO en 127.0.0.1:11434. Idempotente.
#
# POR QUÉ (2026-10-19, Alex: «sí, se aprueba lo sugerido»): un servidor del cerebro de la cuenta con
# modelos locales para el primer peldaño «local primero» (architecture/genesis-conectores-abiertos.md).
# MEDIDO en este A1 (2 OCPU Ampere, 12 GB), qwen3.5:4b Q4_K_M: lee ~15 tokens/s y escribe ~4,8 tokens/s.
# Un escritor del enjambre manda ~22.000 tokens por intento (≈25 min solo de lectura): por eso NO entra
# como escritor ni revisor; sirve tareas CORTAS (chat breve, resumen, clasificación, visión).
#
# Guardas: un solo modelo cargado, prioridad baja (Nice 10, CPUWeight 50) y techo de memoria para no
# tumbar BitNet, FreeLLMAPI, el guardián (tsc con 4 GB) ni los trabajadores. Nada se abre a internet.
# Modelo: Apache 2.0 (comprobado con `ollama show <modelo> --license`); nada no comercial.
#
# Uso (en el A1, como ubuntu): bash ollama-a1.sh [modelo]   (por defecto qwen3.5:4b)
set -euo pipefail
MODELO="${1:-qwen3.5:4b}"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh -o /tmp/ollama-install.sh
  sudo sh /tmp/ollama-install.sh
fi
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/starseed.conf >/dev/null <<'CONF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=5m"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
Nice=10
CPUWeight=50
MemoryHigh=5500M
MemoryMax=6500M
CONF
sudo systemctl daemon-reload
sudo systemctl enable ollama >/dev/null
sudo systemctl restart ollama
for _ in $(seq 1 20); do curl -fs 127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done
ollama pull "$MODELO"
ollama show "$MODELO" --license | head -3
echo "ollama $(ollama --version | awk '{print $NF}') · $MODELO listo en 127.0.0.1:11434"
