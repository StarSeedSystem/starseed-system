# ============================================================================
# Dockerfile — Servidor de cerebro de StarSeed (sin dependencias, stdlib)
# ----------------------------------------------------------------------------
# Imagen mínima basada en python:3.12-slim. El servidor solo usa la biblioteca
# estándar de Python, así que no hace falta instalar nada con pip.
#
# Construir:
#   docker build -t starseed-brain .
#
# Ejecutar (servidor en http://localhost:8800):
#   docker run -p 8800:8800 starseed-brain
#
# Ejecutar conectándolo a un Ollama que corre en el host (IA libre):
#   docker run -p 8800:8800 \
#     -e OLLAMA_URL=http://host.docker.internal:11434 \
#     -e OLLAMA_MODEL=llama3 \
#     starseed-brain
#
# Persistir el bundle sincronizado (carpeta apta para Syncthing):
#   docker run -p 8800:8800 -v "$PWD/starseed_brain:/app/starseed_brain" starseed-brain
# ============================================================================

FROM python:3.12-slim

WORKDIR /app

# Copiamos el único archivo necesario: el servidor.
COPY local_brain.py /app/local_brain.py

# --- Variables de entorno (configurables con `docker run -e ...`) -----------
# HOST          interfaz de escucha (0.0.0.0 para que sea accesible fuera).
# PORT          puerto del servidor.
# OLLAMA_URL    base del servidor Ollama (IA libre). Vacío = stub de eco.
# OLLAMA_MODEL  modelo de Ollama a usar (requiere `ollama pull <modelo>`).
ENV HOST=0.0.0.0 \
    PORT=8800 \
    OLLAMA_URL=http://127.0.0.1:11434 \
    OLLAMA_MODEL=llama3

EXPOSE 8800

CMD ["python", "local_brain.py"]
