#!/usr/bin/env bash
# instalar.sh — instala (o actualiza) la puerta de datos en el A1. Idempotente.
# Uso (como root, lo corre scripts/puente/puerta_datos.py desplegar):
#   bash instalar.sh /ruta/del/paquete
# Nada de secretos aquí: los VALORES de /etc/starseed/puerta-datos.env los escribe la neurona por
# SSH (por la entrada estándar, sin imprimirlos). Si el archivo no existe, se crea con los NOMBRES.
set -euo pipefail

PAQ="${1:-/tmp/starseed-puerta-datos}"
U=starseed
DEST=/opt/starseed/puerta-datos
DATOS=/var/lib/starseed/puerta-datos
CONF=/etc/starseed/puerta-datos
ENVF=/etc/starseed/puerta-datos.env
LOG=/var/log/starseed/puerta-datos-instalar.log
mkdir -p /var/log/starseed
exec > >(tee -a "$LOG") 2>&1
paso() { echo "[$(date -u +%FT%TZ)] $*"; }

paso "inicio"
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"

NODE=/usr/local/bin/node
[ -x "$NODE" ] || NODE=$(command -v node || true)
[ -n "$NODE" ] || { echo "falta node (>= 22.13)"; exit 3; }
"$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) process.exit(1)' \
  || { echo "node demasiado viejo: $("$NODE" --version) (hace falta >= 22.13 por node:sqlite)"; exit 3; }

paso "código"
rm -rf "$DEST.nuevo" && mkdir -p "$DEST.nuevo"
cp -r "$PAQ"/. "$DEST.nuevo"/
rm -rf "$DEST.viejo"; [ -d "$DEST" ] && mv "$DEST" "$DEST.viejo"; mv "$DEST.nuevo" "$DEST"
chown -R root:root "$DEST"; chmod -R a+rX "$DEST"

paso "carpetas y permisos"
mkdir -p "$DATOS" "$CONF"
chown "$U:$U" "$DATOS"; chmod 750 "$DATOS"
chown root:"$U" "$CONF"; chmod 750 "$CONF"
[ -f "$CONF/tokens.json" ] || echo '{"fichas":[]}' > "$CONF/tokens.json"
chown root:"$U" "$CONF/tokens.json"; chmod 640 "$CONF/tokens.json"
if [ ! -f "$ENVF" ]; then
  cp "$DEST/deploy/env.nombres" "$ENVF"
fi
chown root:"$U" "$ENVF"; chmod 640 "$ENVF"

paso "servicio"
sed "s#/usr/local/bin/node#$NODE#" "$DEST/deploy/starseed-puerta-datos.service" > /etc/systemd/system/starseed-puerta-datos.service
systemctl daemon-reload
systemctl enable starseed-puerta-datos >/dev/null 2>&1 || true
systemctl restart starseed-puerta-datos

paso "comprobación"
for i in $(seq 1 20); do
  if sudo -u "$U" env $(grep -E '^PUERTA_PUERTO=' "$ENVF" | xargs -r) "$NODE" --disable-warning=ExperimentalWarning "$DEST/bin/puerta-datos.mjs" comprobar >/dev/null 2>&1; then
    paso "puerta sana"
    exit 0
  fi
  sleep 1
done
paso "la puerta no respondió a tiempo"
journalctl -u starseed-puerta-datos -n 20 --no-pager | sed -E 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<ip>/g'
exit 4
