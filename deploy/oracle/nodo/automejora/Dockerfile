# La caja Docker de la automejora Meta^n (tarea MTN1027F).
# Contrato: architecture/automejora-meta-n.md §3 — Meta^n PROPONE dentro de la
# caja sin red ni claves; el juez de StarSeed decide FUERA sin ejecutar nada suyo.
# Construir (desde esta carpeta): docker build -t starseed-automejora .
FROM python:3.12-slim

# git solo para clonar; se retira al final para dejar el núcleo dentro de la caja.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && git clone https://github.com/minnesotanlp/meta-n.git /src/meta-n \
    && cd /src/meta-n \
    && git checkout b7081843d3c7b0e0f418ca10aaf2ccbff856e7f8 \
    && pip install --no-cache-dir . \
    && apt-get purge -y git \
    && rm -rf /var/lib/apt/lists/* /src/meta-n

# Lo que corre dentro: reenviador → meta-n → pautas para el juez de fuera.
COPY dentro.py /app/dentro.py

# Caja sin privilegios y lista para: docker run --rm --network none
# --read-only --tmpfs /tmp --memory 1g --cpus 1 --pids-limit 256
# --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp
# con montajes: /work (la noche) y /run/llm.sock (la pasarela del anfitrión).
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python", "/app/dentro.py"]
