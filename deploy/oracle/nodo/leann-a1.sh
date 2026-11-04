#!/bin/bash
# StarSeed · LEANN, el recuerdo semántico, en el A1 de Oracle (LNN1028C).
#
# Contrato: architecture/leann-recuerdo-semantico.md §3. El servidor de recuerdo corre en
# 127.0.0.1:4495 con token y lo gobierna starseed-leann.service; este guion solo deja el ENTORNO:
#   1. Ollama con el modelo de incrustaciones qwen3-embedding:0.6b, cuya licencia Apache-2.0 se
#      comprueba ANTES de dejarlo instalado (se baja con ollama-a1.sh, que ya comprueba e imprime);
#   2. el entorno del servicio de Ollama: el modelo se carga solo 2 min tras dejar de usarse
#      (OLLAMA_KEEP_ALIVE) y es el ÚNICO modelo cargado (OLLAMA_MAX_LOADED_MODELS=1);
#   3. un venv en /opt/starseed/leann/.venv con leann==0.3.8 FIJADO (leann-core arrastra torch y
#      sentence-transformers: ~1,5–2 GB en disco, la descarga grande — solo con el visto bueno de
#      Alex vía `oracle_nodo.py leann --aplicar`; la primera vez tarda por eso).
# Idempotente, como ollama-a1.sh. En la Mac NO se instala (disco: medido 2026-10-28, 2,6 GB libres).
# La unidad viaja con el paquete (deploy/oracle/nodo/systemd) y su guardia `# requiere:` solo la
# deja instalada cuando este venv ya existe; el código del servidor va en el paquete a `leann/`.
#
# Uso (en el A1, como ubuntu): sudo bash /opt/starseed/nodo/leann-a1.sh
set -euo pipefail
VENV=/opt/starseed/leann/.venv
LEANN_VERSION=0.3.8
MODELO=qwen3-embedding:0.6b
NODO="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Ollama y el modelo de incrustaciones, con licencia comprobada ANTES de dejarlo ────────────
bash "$NODO/ollama-a1.sh" "$MODELO"
if ! ollama show "$MODELO" --license 2>/dev/null | grep -q "Apache License"; then
  echo "FRENO: $MODELO no declara licencia Apache-2.0. Se quita el modelo y no se deja nada instalado."
  ollama rm "$MODELO"
  exit 1
fi

# ── 2. El entorno del servicio de Ollama: solo 2 min en memoria y un modelo cargado a la vez ─────
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/zzz-leann.conf >/dev/null <<'CONF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=2m"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
CONF
sudo systemctl daemon-reload
sudo systemctl restart ollama
# (El nombre del drop-in lleva zzz porque systemd lee los .d en orden alfabético y la ÚLTIMA
# asignación de una variable gana: así pisa el KEEP_ALIVE=5m de starseed.conf de ollama-a1.sh
# solo en lo que atañe a LEANN, sin reescribir lo que ese guion dejó.)

# ── 3. Venv con leann fijado; solo se (re)instala si falta o cambió de versión ──────────────────
sudo mkdir -p /opt/starseed/leann
sudo chown starseed:starseed /opt/starseed/leann
if [ ! -x "$VENV/bin/python" ]; then
  sudo -u starseed -H python3 -m venv "$VENV"
fi
instalada=$("$VENV/bin/pip" show leann 2>/dev/null | sed -n 's/^Version: //p' || true)
if [ "$instalada" != "$LEANN_VERSION" ]; then
  sudo -u starseed -H "$VENV/bin/pip" install --no-cache-dir "leann==$LEANN_VERSION"
fi

# ── 4. Índices y servicio: índices en /var/lib/starseed/leann, unidad del paquete ────────────────
sudo mkdir -p /var/lib/starseed/leann
sudo chown starseed:starseed /var/lib/starseed/leann
if [ -f "$NODO/systemd/starseed-leann.service" ] && [ -f "$NODO/leann/leann_servidor.py" ]; then
  sudo install -m 644 "$NODO/systemd/starseed-leann.service" /etc/systemd/system/starseed-leann.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now starseed-leann
fi
echo "leann $LEANN_VERSION en $VENV · $MODELO con Apache-2.0 comprobado · servicio starseed-leann en 127.0.0.1:4495"
