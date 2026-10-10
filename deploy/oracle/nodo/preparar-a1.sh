#!/usr/bin/env bash
# preparar-a1.sh — deja el A1 de Oracle como NODO SIEMPRE ENCENDIDO de MetaGenesis (OPO1011, 2026-10-10).
#
# Alex (2026-10-10), con el medidor de Oracle delante: «starseed-a1 lleva 2,3 días ocioso (CPU p95
# 0,52 %, memoria 5,26 %, red 0 %; umbral 20 %). Si sigue así, Oracle puede reclamarlo desde el
# 14 oct … solucionala». Este guion le da TRABAJO ÚTIL Y SOSTENIDO, no un bucle vacío:
#   1. un MEDIO del enjambre (orquestador + opencode con los proveedores gratuitos) que toma las
#      colas `colas/oracle-*` del repo por HTTPS de solo lectura y deja su trabajo en ramas
#      `nube/a1-*` que una neurona con la llave SSH trae a GitHub y main pasa por sus puertas;
#   2. el GUARDIÁN DE MAIN: cuando no hay cola, comprueba el main de la Mac (tsc, pruebas del puente
#      y vitest) cada pocas horas y deja el veredicto para Genesis — el CI de verdad que nos faltaba;
#   3. un NODO BITNET de Astraura (`scripts/nodo-bitnet.sh` del repo astraura) detrás de Caddy con
#      HTTPS (sslip.io) y clave, para las neuronas de la cuenta;
#   4. MetaGeminis en modo BORRADOR y el nodo de MetaGenesis si existen en el paquete.
# Todo como servicios systemd con reinicio, límites de memoria y registros rotados.
#
# Uso (lo corre `scripts/puente/oracle_nodo.py instalar`, como root en el A1):
#   bash preparar-a1.sh /ruta/del/paquete        # idempotente: lo hecho no se repite
#
# Reglas (architecture/oracle-nube.md §10): nada sin autenticación, ningún secreto impreso, solo
# recursos Always Free (esto no crea nada en Oracle: trabaja dentro de la máquina que ya existe).
set -euo pipefail

PAQ="${1:-/tmp/starseed-nodo}"
U=starseed
H=/home/$U
NODO=/opt/starseed/nodo
ESTADO=/var/lib/starseed/nodo
LOG=/var/log/starseed/preparar.log
mkdir -p /var/log/starseed "$ESTADO" /etc/starseed "$NODO"
exec >>"$LOG" 2>&1
paso() { echo "[$(date -u +%FT%TZ)] $*"; echo "$*" > "$ESTADO/preparar-fase.txt"; }
como() { sudo -u "$U" -H bash -lc "$1"; }

paso "inicio (paquete $PAQ)"

# ── 1. usuario de servicio (sin contraseña ni llave SSH: solo corre servicios) ─────────────────
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
chown "$U:$U" "$ESTADO"
chmod 750 /etc/starseed
chgrp "$U" /etc/starseed

# ── 2. paquetes ───────────────────────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
faltan=()
for p in cmake clang ninja-build python3-venv python3-pip jq logrotate curl git; do
  dpkg -s "$p" >/dev/null 2>&1 || faltan+=("$p")
done
if [ ${#faltan[@]} -gt 0 ]; then
  paso "apt: ${faltan[*]}"
  apt-get update -q
  apt-get install -y -q "${faltan[@]}"
fi

# ── 3. código del nodo (lo que trajo el paquete; versión de la neurona que instala) ─────────────
paso "código del nodo"
rm -rf "$NODO.nuevo" && mkdir -p "$NODO.nuevo"
cp -r "$PAQ"/. "$NODO.nuevo"/
rm -rf "$NODO.viejo"; [ -d "$NODO" ] && mv "$NODO" "$NODO.viejo"; mv "$NODO.nuevo" "$NODO"
chown -R root:root "$NODO"; chmod -R a+rX "$NODO"
chmod +x "$NODO"/*.sh 2>/dev/null || true

# ── 4. repo del OS por HTTPS, SOLO LECTURA (repo público, sin credenciales) ─────────────────────
paso "repo del OS"
if [ ! -d "$H/starseed-system/.git" ]; then
  como "git clone -q https://github.com/StarSeedSystem/starseed-system.git ~/starseed-system"
fi
como "cd ~/starseed-system && git config user.email enjambre-oracle@starseed.local && git config user.name 'Enjambre StarSeed (oracle-a1)' && git fetch -q origin main && (git rev-parse -q --verify main >/dev/null || git checkout -q -B main origin/main)"
# Nadie empuja desde aquí: la URL de empuje no existe (solo lectura de verdad, no por costumbre).
como "cd ~/starseed-system && git remote set-url --push origin no-se-empuja-desde-el-a1"

# ── 5. Node: dependencias del repo (puertas tsc/vitest) y opencode con versión FIJA ──────────────
paso "npm (dependencias del repo y opencode)"
como "npm config set prefix ~/.npm-global && npm config delete omit >/dev/null 2>&1 || true"
como "cd ~/starseed-system && h=\$(sha256sum package-lock.json | cut -c1-16); [ -f node_modules/.huella-lock ] && [ \"\$(cat node_modules/.huella-lock)\" = \"\$h\" ] || { npm ci --include=dev --no-audit --no-fund --loglevel=error && echo \$h > node_modules/.huella-lock; }"
como "command -v ~/.npm-global/bin/opencode >/dev/null || npm install -g opencode-ai@1.18.33 --no-audit --no-fund --loglevel=error"
como "mkdir -p ~/.config/opencode ~/.starseed ~/starseed-wt && cp $NODO/opencode.json ~/.config/opencode/opencode.json"

# ── 6. orquestador del enjambre (instalar.sh: mismo archivo que la Mac y la nube) ───────────────
paso "orquestador"
como "bash $NODO/enjambre/instalar.sh"

# ── 7. BitNet de Astraura (vendorizado, pesos oficiales i2_s) ──────────────────────────────────
paso "BitNet (compilar + pesos; la primera vez tarda)"
if [ ! -d "$H/astraura/.git" ]; then
  como "git clone -q --depth 1 https://github.com/StarSeedSystem/astraura.git ~/astraura"
fi
# Se compila AQUÍ y no con `nodo-bitnet.sh preparar`: ese guion pide `-DBITNET_ARM_TL1=ON` en arm64
# y, con el llama.cpp vendorizado de hoy, `bitnet-lut-kernels.h` no compila («no member named
# 'backend' in 'ggml_tensor'», medido en este A1 el 2026-10-10). La Mac (también arm64) compila con
# TL1 apagado y sirve los pesos i2_s validados: mismas banderas aquí. Sin la interfaz web de
# llama.cpp (LLAMA_BUILD_UI=OFF y LLAMA_USE_PREBUILT_UI=OFF): con ella pedía npm + vite o bajaba de
# Hugging Face una versión «latest» a la que le falta `loading.html` y el enlazado fallaba (medido).
# Nadie la usa: Astraura habla con la API.
como "cd ~/astraura/backend/BitNet && if [ ! -x build/bin/llama-server ]; then rm -rf build/3rdparty/llama.cpp/tools/ui/dist && cmake -B build -DBITNET_ARM_TL1=OFF -DBITNET_X86_TL2=OFF -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DCMAKE_BUILD_TYPE=Release >/dev/null && cmake --build build --config Release -j\$(nproc) --target llama-server llama-cli; fi"
# Pesos oficiales i2_s (1,1 GB) y perfil: los pone el guion de Astraura (con el binario ya hecho no compila).
como "NODO_BITNET_DIR=~/.starseed/nodo-bitnet bash ~/astraura/scripts/nodo-bitnet.sh preparar"
if [ ! -s /etc/starseed/bitnet.key ]; then
  ( umask 077; openssl rand -hex 32 > /etc/starseed/bitnet.key )
fi
chown root:"$U" /etc/starseed/bitnet.key; chmod 640 /etc/starseed/bitnet.key

# ── 8. Caddy (HTTPS automático con sslip.io) en Docker, red del anfitrión, 128 MB ───────────────
paso "Caddy"
if [ ! -s /etc/starseed/host ]; then
  ip=$(curl -s -m 10 https://api.ipify.org || true)
  [ -n "$ip" ] && echo "$(echo "$ip" | tr . -).sslip.io" > /etc/starseed/host
fi
[ -f /etc/starseed/host ] && { chown root:"$U" /etc/starseed/host; chmod 640 /etc/starseed/host; }
if [ -s /etc/starseed/host ]; then
  HOST=$(cat /etc/starseed/host)
  sed "s/{\$STARSEED_HOST}/$HOST/g" "$NODO/Caddyfile.nodo" > /etc/starseed/Caddyfile
  chmod 644 /etc/starseed/Caddyfile
  docker volume create starseed_caddy_data >/dev/null
  if ! docker ps --format '{{.Names}}' | grep -qx starseed-caddy; then
    docker rm -f starseed-caddy >/dev/null 2>&1 || true
    docker run -d --name starseed-caddy --restart unless-stopped --network host --memory 128m \
      --log-opt max-size=10m --log-opt max-file=3 \
      -v /etc/starseed/Caddyfile:/etc/caddy/Caddyfile:ro -v starseed_caddy_data:/data caddy:2-alpine >/dev/null
  else
    docker exec starseed-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || docker restart starseed-caddy >/dev/null
  fi
fi

# ── 9. registros rotados ────────────────────────────────────────────────────────────────────────
paso "registros"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=400M\nMaxRetentionSec=14day\n' > /etc/systemd/journald.conf.d/starseed.conf
cp "$NODO/logrotate-starseed" /etc/logrotate.d/starseed
systemctl restart systemd-journald || true

# ── 10. servicios ──────────────────────────────────────────────────────────────────────────────
paso "servicios"
for u in "$NODO"/systemd/*.service "$NODO"/systemd/*.timer; do
  [ -f "$u" ] || continue
  n=$(basename "$u")
  # Un servicio que necesita un archivo que este paquete no trae no se instala (MetaGeminis y el
  # nodo de MetaGenesis solo existen cuando el paquete los lleva).
  req=$(sed -n 's/^# requiere: //p' "$u" | head -1)
  if [ -n "$req" ] && [ ! -e "$req" ]; then
    systemctl disable --now "$n" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$n"
    echo "  $n: no se instala (falta $req)"
    continue
  fi
  install -m 644 "$u" "/etc/systemd/system/$n"
done
systemctl daemon-reload
for u in /etc/systemd/system/starseed-*.service /etc/systemd/system/starseed-*.timer; do
  [ -f "$u" ] || continue
  n=$(basename "$u")
  case "$n" in
    *.timer) systemctl enable --now "$n" >/dev/null ;;
    *) if grep -q '^# temporizado' "$u"; then systemctl enable "$n" >/dev/null 2>&1 || true
       elif [ "$n" = starseed-medio.service ] && grep -q '"fase": "cola"' "$ESTADO/estado.json" 2>/dev/null; then
         # Con una cola del enjambre en marcha no se corta: el código nuevo entra en el próximo arranque.
         systemctl enable "$n" >/dev/null; echo "  $n: cola en marcha, no lo reinicio"
       else systemctl enable "$n" >/dev/null; systemctl restart "$n"; fi ;;
  esac
done

paso "listo"
echo "listo" > "$ESTADO/preparar-fase.txt"
date -u +%FT%TZ > "$ESTADO/preparado.txt"
