#!/bin/bash
# Servicios pesados del OS BAJO DEMANDA en un servidor Linux de las capas de conciencia (el A1, 2026-10-20).
# Contrato: architecture/repos-libreria-1020d.md §3 y §7. Cada servicio escucha en 127.0.0.1 con un socket de systemd,
# se enciende al primer uso SOLO si cabe (starseed-cabe) y se apaga a los 15 min sin uso; OOMScoreAdjust=900.
# Requisitos: Docker, las imágenes ya descargadas y, para ComfyUI, /srv/starseed/comfyui con su venv y un checkpoint.
# Uso (en el servidor): bash servicios-bajo-demanda.sh
# 1) guardias
sudo tee /usr/local/bin/starseed-cabe >/dev/null <<'G'
#!/bin/bash
# starseed-cabe <MB>: sale 0 si hay al menos <MB> de memoria disponible; si no, 1 (y lo dice).
need=${1:-1024}; av=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
if [ "$av" -lt "$need" ]; then echo "starseed-cabe: no cabe (${av} MB libres, pide ${need} MB)"; exit 1; fi
G
sudo tee /usr/local/bin/starseed-esperar-puerto >/dev/null <<'G'
#!/bin/bash
# starseed-esperar-puerto <puerto> <segundos> [ruta]: espera a que 127.0.0.1:<puerto><ruta> conteste.
p=$1; s=${2:-180}; r=${3:-/}; for i in $(seq 1 "$s"); do curl -s -o /dev/null -m 2 "http://127.0.0.1:$p$r" && exit 0; sleep 1; done; echo "no contesta $p"; exit 1
G
sudo chmod 755 /usr/local/bin/starseed-cabe /usr/local/bin/starseed-esperar-puerto

set -u
mk() { # nombre puerto_publico puerto_interno MB_necesarios espera_s ruta_salud usuario "orden" "parar"
  n=$1; pub=$2; int=$3; need=$4; w=$5; h=$6; u=$7; ex=$8; st=$9
  sudo tee /etc/systemd/system/starseed-$n-app.service >/dev/null <<EOF
[Unit]
Description=StarSeed · $n bajo demanda (lo enciende su socket; se apaga solo a los 15 min sin uso)
StopWhenUnneeded=yes
[Service]
Type=simple
User=$u
ExecStartPre=/usr/local/bin/starseed-cabe $need
ExecStart=$ex
ExecStartPost=/usr/local/bin/starseed-esperar-puerto $int $w $h
ExecStop=$st
TimeoutStartSec=$((w+30))
OOMScoreAdjust=900
Restart=no
EOF
  sudo tee /etc/systemd/system/starseed-$n.service >/dev/null <<EOF
[Unit]
Description=StarSeed · puerta bajo demanda de $n (127.0.0.1:$pub → $int)
Requires=starseed-$n-app.service
After=starseed-$n-app.service
[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd --exit-idle-time=15min 127.0.0.1:$int
EOF
  sudo tee /etc/systemd/system/starseed-$n.socket >/dev/null <<EOF
[Unit]
Description=StarSeed · socket de $n en 127.0.0.1:$pub
[Socket]
ListenStream=127.0.0.1:$pub
[Install]
WantedBy=sockets.target
EOF
}
D=/usr/bin/docker
mk libretranslate 5000 15000 1500 600 /languages root "$D run --rm --name ss-libretranslate --oom-score-adj 900 --memory 2g -p 127.0.0.1:15000:5000 -v ss_lt:/home/libretranslate/.local -e LT_LOAD_ONLY=es,en,pt,fr,de,it -e LT_THREADS=2 -e LT_DISABLE_WEB_UI=true libretranslate/libretranslate:latest" "$D stop -t 20 ss-libretranslate"
mk stirling-pdf 8180 18180 1500 300 / root "$D run --rm --name ss-stirling-pdf --oom-score-adj 900 --memory 2g -p 127.0.0.1:18180:8080 -v ss_stirling:/configs -e DOCKER_ENABLE_SECURITY=false -e SECURITY_ENABLELOGIN=false -e SYSTEM_ENABLEANALYTICS=false -e LANGS=es_ES stirlingtools/stirling-pdf:latest" "$D stop -t 20 ss-stirling-pdf"
mk archivebox 8001 18001 1200 240 / root "$D run --rm --name ss-archivebox --oom-score-adj 900 --memory 2g -p 127.0.0.1:18001:8000 -v ss_archivebox:/data -e ALLOWED_HOSTS=* archivebox/archivebox server --quick-init 0.0.0.0:8000" "$D stop -t 20 ss-archivebox"
mk comfyui 8188 18188 4500 240 /system_stats ubuntu "/srv/starseed/comfyui/venv/bin/python /srv/starseed/comfyui/main.py --cpu --listen 127.0.0.1 --port 18188 --disable-auto-launch" "/bin/kill -INT \$MAINPID"
sudo sed -i 's#^\[Service\]#[Service]\nWorkingDirectory=/srv/starseed/comfyui\nMemoryMax=6G#' /etc/systemd/system/starseed-comfyui-app.service
if [ -s /srv/starseed/openhands-tag ]; then OT=$(cat /srv/starseed/openhands-tag)
  mk openhands 8010 18010 2500 240 /health root "$D run --rm --name ss-openhands --oom-score-adj 900 --memory 3g -p 127.0.0.1:18010:8000 ghcr.io/openhands/agent-server:$OT" "$D stop -t 20 ss-openhands"; fi
sudo systemctl daemon-reload
for n in libretranslate stirling-pdf archivebox comfyui openhands; do [ -f /etc/systemd/system/starseed-$n.socket ] && sudo systemctl enable --now starseed-$n.socket 2>&1 | tail -1; done
systemctl list-sockets --no-pager | grep starseed
