#!/usr/bin/env bash
# bitnet-servir.sh — BitNet b1.58 2B-4T en PRIMER PLANO para systemd (OPO1011, 2026-10-10).
#
# `nodo-bitnet.sh arrancar` (repo astraura) lo deja en segundo plano con nohup: bien para una
# terminal, mal para systemd, que necesita el proceso delante para reiniciarlo si cae. Aquí se
# reutiliza su PERFIL (mide núcleos y RAM y elige hilos, contexto y slots) y se lanza el mismo
# llama-server con tres diferencias, todas a propósito:
#   · --api-key-file /etc/starseed/bitnet.key: Caddy lo publica por HTTPS y nada público va sin
#     clave (architecture/oracle-nube.md §10). /health queda abierto para las sondas;
#   · --no-mmap: los pesos van a memoria propia del proceso, no a la caché de páginas que el kernel
#     puede soltar; la primera respuesta no espera a leer 1,1 GB del disco;
#   · escucha solo en 127.0.0.1: desde fuera se entra por Caddy, nunca directo.
set -euo pipefail
A="${ASTRAURA_DIR:-$HOME/astraura}"
export NODO_BITNET_DIR="${NODO_BITNET_DIR:-$HOME/.starseed/nodo-bitnet}"
P=$(bash "$A/scripts/nodo-bitnet.sh" perfil)
v() { echo "$P" | sed "s/.*\"$1\":\([0-9]*\).*/\1/"; }
REPO="$A/backend/BitNet"
M="$REPO/models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf"
T="$A/backend/llama3_chat_template.jinja"
args=(-m "$M" --host 127.0.0.1 --port "${BITNET_PORT:-8790}" -t "$(v hilos)" -c "$(v ctx)"
      --parallel "$(v paralelo)" -ub 24 -b 24 -ngl 0 -ctk q8_0 -ctv q8_0 --no-mmap
      --override-kv tokenizer.ggml.pre=str:llama-bpe --api-key-file /etc/starseed/bitnet.key)
[ -f "$T" ] && args+=(--jinja --chat-template-file "$T")
echo "perfil: $P"
exec "$REPO/build/bin/llama-server" "${args[@]}"
