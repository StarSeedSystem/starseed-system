#!/usr/bin/env bash
# instalar.sh · Instala starseed-ayudante con regla sudoers limitada (TRM1125C)
# Verifica con visudo -c antes de mover la regla.

set -euo pipefail

readonly AYUDANTE_ORIGEN="$(dirname "$0")/starseed-ayudante"
readonly AYUDANTE_DESTINO="/usr/local/sbin/starseed-ayudante"
readonly SUDOERS_ARCHIVO="/etc/sudoers.d/starseed-ayudante"
readonly LOG_DIR="/var/log/starseed-ayudante"
readonly CONFIG_DIR="/etc/starseed"
readonly ALMACENES_AUTORIZADOS="${CONFIG_DIR}/almacenes-autorizados.json"
readonly VERSION_ARCHIVO="${CONFIG_DIR}/version"

# ──────────────────────────────────────────────────────────────
# Utilidades
# ──────────────────────────────────────────────────────────────

msg() { echo -e "\033[1;32m[INSTALAR]\033[0m $*"; }
err() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }
aviso() { echo -e "\033[1;33m[AVISO]\033[0m $*"; }

# ──────────────────────────────────────────────────────────────
# Verificaciones previas
# ──────────────────────────────────────────────────────────────

if [[ ${EUID} -ne 0 ]]; then
    err "Este script debe ejecutarse como root (sudo $0)"
    exit 1
fi

if [[ ! -f "${AYUDANTE_ORIGEN}" ]]; then
    err "No se encuentra ${AYUDANTE_ORIGEN}"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    err "jq no está instalado. Instálelo con: apt install jq / dnf install jq / pacman -S jq"
    exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
    err "sha256sum no está disponible"
    exit 1
fi

msg "Verificando sintaxis del ayudante..."
bash -n "${AYUDANTE_ORIGEN}" || { err "bash -n falló en el ayudante"; exit 1; }

msg "Verificando sintaxis del instalador..."
bash -n "$0" || { err "bash -n falló en el instalador"; exit 1; }

# ──────────────────────────────────────────────────────────────
# Crear directorios y archivos de configuración
# ──────────────────────────────────────────────────────────────

msg "Creando directorios..."
mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}"
chown root:adm "${LOG_DIR}" 2>/dev/null || true

mkdir -p "${CONFIG_DIR}"
chmod 750 "${CONFIG_DIR}"

mkdir -p /run/starseed-ayudante
chmod 750 /run/starseed-ayudante

mkdir -p /var/lib/starseed
chmod 750 /var/lib/starseed

# ──────────────────────────────────────────────────────────────
# Archivo de series autorizadas para formatear
# ──────────────────────────────────────────────────────────────

if [[ ! -f "${ALMACENES_AUTORIZADOS}" ]]; then
    msg "Creando ${ALMACENES_AUTORIZADOS} (lista vacía, edítelo para autorizar series)..."
    cat > "${ALMACENES_AUTORIZADOS}" <<'EOF'
{
  "series": [],
  "nota": "Añada aquí los números de serie de los discos autorizados para formatear. Ejemplo: \"series\": [\"ABC123\", \"XYZ789\"]"
}
EOF
    chmod 640 "${ALMACENES_AUTORIZADOS}"
    chown root:root "${ALMACENES_AUTORIZADOS}"
fi

# ──────────────────────────────────────────────────────────────
# Archivo de versión
# ──────────────────────────────────────────────────────────────

if [[ ! -f "${VERSION_ARCHIVO}" ]]; then
    echo "0.0.0" > "${VERSION_ARCHIVO}"
    chmod 644 "${VERSION_ARCHIVO}"
fi

# ──────────────────────────────────────────────────────────────
# Instalar el ayudante
# ──────────────────────────────────────────────────────────────

msg "Instalando ${AYUDANTE_DESTINO}..."
cp "${AYUDANTE_ORIGEN}" "${AYUDANTE_DESTINO}"
chmod 750 "${AYUDANTE_DESTINO}"
chown root:root "${AYUDANTE_DESTINO}"

# ──────────────────────────────────────────────────────────────
# Regla sudoers limitada
# ──────────────────────────────────────────────────────────────

msg "Creando regla sudoers limitada..."

cat > "${SUDOERS_ARCHIVO}.tmp" <<'EOF'
# starseed-ayudante · Regla sudoers limitada (TRM1125C)
# Permite ejecutar SOLO el ayudante con las órdenes tipadas permitidas.
# NO concede ALL ni shell libre.

# Usuario/grupo que puede invocar el ayudante (ajuste según su sistema)
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes estado
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes salud
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes formatear --serie *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes montar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes desmontar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante almacenes verificar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante servicios lista
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante servicios estado *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante servicios iniciar *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante servicios parar *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante servicios reiniciar *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante actualizar estado
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante actualizar buscar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante actualizar aplicar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante registros leer *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante reiniciar app
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante modo-completo activar --caducidad-min *
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante modo-completo desactivar
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante modo-completo estado
%starseed ALL=(root) NOPASSWD: /usr/local/sbin/starseed-ayudante estado
EOF

msg "Validando regla sudoers con visudo -c..."
if ! visudo -c -f "${SUDOERS_ARCHIVO}.tmp"; then
    err "visudo -c falló: la regla sudoers tiene errores de sintaxis"
    rm -f "${SUDOERS_ARCHIVO}.tmp"
    exit 1
fi

msg "Moviendo regla sudoers a ${SUDOERS_ARCHIVO}..."
mv "${SUDOERS_ARCHIVO}.tmp" "${SUDOERS_ARCHIVO}"
chmod 440 "${SUDOERS_ARCHIVO}"
chown root:root "${SUDOERS_ARCHIVO}"

# ──────────────────────────────────────────────────────────────
# Grupo starseed (si no existe, crearlo)
# ──────────────────────────────────────────────────────────────

if ! getent group starseed >/dev/null; then
    msg "Creando grupo 'starseed'..."
    groupadd -r starseed
fi

aviso "Añada al usuario dueño al grupo 'starseed' para usar el ayudante sin contraseña:"
aviso "  sudo usermod -a -G starseed \$USUARIO"

# ──────────────────────────────────────────────────────────────
# Verificación final
# ──────────────────────────────────────────────────────────────

msg "Verificando instalación..."
"${AYUDANTE_DESTINO}" --help >/dev/null && msg "Ayudante instalado correctamente en ${AYUDANTE_DESTINO}"
"${AYUDANTE_DESTINO}" estado >/dev/null && msg "Comando 'estado' funciona"

msg "Instalación completada."
cat <<'EOF'

PRÓXIMOS PASOS:
1. Añada su usuario al grupo starseed:
     sudo usermod -a -G starseed $USER
   (Cierre sesión y vuelva a entrar para que surta efecto)

2. Edite /etc/starseed/almacenes-autorizados.json para autorizar
   los números de serie de los discos que puedan formatearse.

3. Pruebe el ayudante:
     starseed-ayudante --help
     starseed-ayudante estado
     sudo starseed-ayudante almacenes estado

NOTA: La regla sudoers permite al grupo 'starseed' ejecutar el ayudante
SIN contraseña, pero SOLO con las órdenes y argumentos listados arriba.
No concede acceso root general.
EOF