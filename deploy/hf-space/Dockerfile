# Medio «nube-hf»: un Space de Hugging Face (CPU basic gratuito: 2 vCPU · 16 GB)
# que corre el enjambre económico de StarSeed OS como un medio más (2026-09-21).
#
# Alex: «se puede más con más medios… algún servicio gratuito como espacios de
# Hugging Face que podamos utilizar para alojar más agentes».
#
# Qué hace el contenedor (ver entrypoint.sh):
#   1. escribe ~/.starseed/env y ~/.config/opencode/opencode.json a partir de los
#      SECRETOS del Space (solo nombres de variable aquí; los valores los pone
#      Alex en Settings → Variables and secrets, o con `scripts/puente/nube-hf.py secretos`);
#   2. clona StarSeedSystem/starseed-system, npm ci, instala el orquestador;
#   3. bucle: git pull → si hay `enjambre/colas/cola-nube-*.json` con tareas
#      pendientes, `starseed-enjambre.py … --workers 2`; sus commits se sirven
#      como `git bundle` por HTTP (puerto 7860) y la Mac los trae con
#      `scripts/puente/nube-hf.py traer` (la nube nunca hace push a main);
#   4. sirve /estado y /bundle en 7860, que es lo que mantiene el Space despierto.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    NEEDLE_TELEMETRY=0 \
    STARSEED_MEDIO=nube-hf \
    STARSEED_ROOT=/home/user/starseed-system \
    STARSEED_WT=/home/user/starseed-wt \
    HOME=/home/user \
    PATH=/home/user/.npm-global/bin:/home/user/bin:/usr/local/bin:/usr/bin:/bin

RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 python3-venv ca-certificates curl procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user

USER user
WORKDIR /home/user
RUN mkdir -p /home/user/.npm-global /home/user/.starseed /home/user/.config/opencode \
    && npm config set prefix /home/user/.npm-global \
    && npm install -g opencode-ai@latest --no-audit --no-fund

COPY --chown=user entrypoint.sh /home/user/entrypoint.sh
COPY --chown=user servidor.py /home/user/servidor.py
COPY --chown=user opencode.json /home/user/.config/opencode/opencode.json
RUN chmod +x /home/user/entrypoint.sh

EXPOSE 7860
CMD ["/home/user/entrypoint.sh"]
