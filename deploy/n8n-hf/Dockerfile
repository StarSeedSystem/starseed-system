# n8n Community en un Space de Hugging Face (ola 1005B, PRD1005T)
# Versión fijada (nunca `latest`), puerto 7860: el que exponen los Spaces.
FROM docker.n8n.io/n8nio/n8n:1.63.4

USER root
COPY arranque.sh /arranque.sh
COPY flujos /opt/flujos
RUN chmod +x /arranque.sh

ENV N8N_PORT=7860 \
    N8N_LISTEN_ADDRESS=0.0.0.0 \
    WEBHOOK_URL="" \
    NODE_FUNCTION_ALLOW_BUILTIN=crypto \
    N8N_SECURE_COOKIE=false

EXPOSE 7860
USER node
ENTRYPOINT ["/arranque.sh"]
