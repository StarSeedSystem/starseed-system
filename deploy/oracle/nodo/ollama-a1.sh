#!/bin/bash
# StarSeed · Ollama en el A1 de Oracle (Always Free), SOLO en 127.0.0.1:11434. Idempotente.
#
# POR QUÉ (2026-10-19, Alex: «sí, se aprueba lo sugerido»): un servidor del cerebro de la cuenta con
# modelos locales para el primer peldaño «local primero» (architecture/genesis-conectores-abiertos.md).
# MEDIDO en este A1 (2 OCPU Ampere, 12 GB), 2026-10-19, prompt de código del repo:
#   qwen3.5:4b (Q4_K_M, 3,3 GB):   ~1.500 tokens → lee 14,9 t/s y escribe 4,8 t/s (respuesta con un fallo);
#                                  ~11.000 tokens → lee 6,4 t/s (28,6 min solo de lectura) y escribe 2,5 t/s.
#   qwen2.5-coder:7b (Q4_K_M, 4,7 GB): ~1.500 tokens → lee 8,4 t/s y escribe 2,9 t/s (respuesta correcta).
# Un escritor del enjambre manda ~22.000 tokens por intento: NINGUNO entra como escritor ni revisor.
# Sirven tareas CORTAS: qwen3.5:4b para chat breve, resumen, clasificación y visión; qwen2.5-coder:7b
# para fragmentos de código cortos. Solo uno cargado a la vez.
#
# ESTADO (2026-10-19): APAGADO. Alex: «hazlo solo si mejora u optimiza los procesos». Medido, hoy ningún
# proceso lo aprovecha (el enjambre escribe con prompts largos y la escalera local de Genesis, GCA1019,
# aún no existe), así que no ocupa CPU ni memoria. Los modelos siguen en el disco del A1 (8 GB).
#   Encender cuando algo lo use de verdad:  bash ollama-a1.sh   (vuelve a dejarlo activo al arranque)
#   Apagar:                                 sudo systemctl disable --now ollama
#
# Guardas: un solo modelo cargado, prioridad baja (Nice 10, CPUWeight 50) y techo de memoria para no
# tumbar BitNet, FreeLLMAPI, el guardián (tsc con 4 GB) ni los trabajadores. Nada se abre a internet.
# Modelo: Apache 2.0 (comprobado con `ollama show <modelo> --license`); nada no comercial.
#
# Uso (en el A1, como ubuntu): bash ollama-a1.sh [modelo…]   (por defecto qwen3.5:4b y qwen2.5-coder:7b)
set -euo pipefail
MODELOS=("$@")
[ ${#MODELOS[@]} -gt 0 ] || MODELOS=(qwen3.5:4b qwen2.5-coder:7b)
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
for MODELO in "${MODELOS[@]}"; do
  ollama pull "$MODELO"
  echo "$MODELO · licencia: $(ollama show "$MODELO" --license | grep -m1 -o -E 'Apache License|MIT License' || echo 'REVÍSALA: no es Apache ni MIT')"
done
echo "ollama $(ollama --version | awk '{print $NF}') · ${MODELOS[*]} listos en 127.0.0.1:11434"
