# Navegador propio de MetaGenesis (NAV1112B) · linux/arm64
# Chromium + Xvfb + Playwright para Python, con un usuario sin privilegios.
FROM --platform=linux/arm64 debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      xvfb \
      xauth \
      bash \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      python3 \
      python3-pip \
 && rm -rf /var/lib/apt/lists/*

# Solo la librería de Playwright: el navegador es el Chromium del sistema y
# los guiones lectores se conectan por el puerto de depuración (CDP).
RUN pip3 install --break-system-packages --no-cache-dir playwright

# Usuario sin privilegios. El uid 1000 coincide con el PUID del escritorio
# Selkies para que el volumen del perfil se comparta en el alta manual sin
# cambiar dueños ni permisos.
RUN useradd -m -u 1000 -s /usr/sbin/nologin navegador \
 && mkdir -p /home/navegador/perfiles \
 && chown -R navegador:navegador /home/navegador \
 && chmod 700 /home/navegador/perfiles

USER navegador
ENV HOME=/home/navegador
WORKDIR /home/navegador

# Sin ENTRYPOINT ni CMD: Compose pasa la orden por servicio (xvfb-run + chromium).
