#!/bin/sh
# preparar-linux.sh — lo que el guion del nodo hacía a mano, por defecto y sin repetir trabajo (LNX1118WD).
#
# Lo lanza «Preparar este Linux» de la lista de permisos con `pkexec /bin/sh -s`: SIEMPRE pasa por el
# diálogo del sistema que acepta la persona; este guion no se ejecuta solo. Es idempotente: se puede
# repetir y solo cambia lo que falte. No usa red salvo `apt` cuando falta un paquete de GStreamer.
#
# Uso: preparar-linux.sh [0|1] [0|1]   (1.º = neurona nodo sin reposo; 2.º = GStreamer propio de la AppImage)
#
# Deja: grupos netdev bluetooth audio video render input plugdev dialout, regla udev de /dev/uinput para
# el grupo input, regla de polkit para que netdev gestione NetworkManager, Bluetooth encendido y los
# paquetes gstreamer1.0-nice / gstreamer1.0-plugins-bad si el sistema no trae GStreamer propio (AppImage).

set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Este guion necesita el diálogo del sistema (pkexec)." >&2
    exit 1
fi

SIN_REPOSO="${1:-0}"
GST_PROPIO="${2:-0}"

# Quién abrió el diálogo: pkexec deja su uid; si no, el usuario de sudo o el que ejecuta.
USUARIO=""
if [ -n "${PKEXEC_UID:-}" ]; then
    USUARIO="$(getent passwd "$PKEXEC_UID" | cut -d: -f1 || true)"
fi
if [ -z "$USUARIO" ]; then
    USUARIO="${SUDO_USER:-}"
fi
if [ -z "$USUARIO" ]; then
    USUARIO="$(id -un)"
fi
HOME_USUARIO="$(getent passwd "$USUARIO" | cut -d: -f6 || true)"
[ -n "$HOME_USUARIO" ] || HOME_USUARIO="/home/$USUARIO"

echo "Preparando el nodo para $USUARIO…"

# ── 1. Grupos del nodo ───────────────────────────────────────────────────────
for grupo in netdev bluetooth audio video render input plugdev dialout; do
    if ! getent group "$grupo" >/dev/null 2>&1; then
        echo "  · el grupo $grupo no existe en este sistema: se omite"
        continue
    fi
    if id -nG "$USUARIO" | tr ' ' '\n' | grep -qx "$grupo"; then
        continue
    fi
    usermod -aG "$grupo" "$USUARIO"
    echo "  · $USUARIO añadido al grupo $grupo"
done

# ── 2. /dev/uinput del grupo input (mando virtual) ──────────────────────────
cat > /etc/udev/rules.d/60-starseed-uinput.rules <<'FIN'
# StarSeed OS: el mando virtual pertenece al grupo input y solo él lo lee y escribe.
KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
FIN
mkdir -p /etc/modules-load.d
printf '%s\n' uinput > /etc/modules-load.d/starseed-uinput.conf
modprobe uinput 2>/dev/null || true
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --name-match=uinput 2>/dev/null || true

# ── 3. Regla de polkit: el grupo netdev gestiona NetworkManager ─────────────
mkdir -p /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/60-starseed-netdev.rules <<'FIN'
// StarSeed OS: quien está en el grupo netdev puede gestionar la red del nodo sin más avisos.
polkit.addRule(function (action, subject) {
    if (action.id.indexOf("org.freedesktop.NetworkManager.") === 0 && subject.isInGroup("netdev")) {
        return polkit.Result.YES;
    }
});
FIN

# ── 4. Bluetooth encendido ──────────────────────────────────────────────────
systemctl enable --now bluetooth 2>/dev/null || echo "  · no hay servicio bluetooth: se omite" >&2

# ── 5. GStreamer si el sistema no trae el suyo (no en AppImage) ─────────────
if [ "$GST_PROPIO" != "1" ] && [ -z "${APPIMAGE:-}" ] && [ -z "${APPDIR:-}" ] && command -v apt-get >/dev/null 2>&1; then
    FALTAN=""
    for paquete in gstreamer1.0-nice gstreamer1.0-plugins-bad; do
        dpkg -s "$paquete" >/dev/null 2>&1 || FALTAN="$FALTAN $paquete"
    done
    if [ -n "$FALTAN" ]; then
        echo "  · instalando GStreamer:$FALTAN (esto sí usa apt)"
        DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null 2>&1 || true
        # shellcheck disable=SC2086
        DEBIAN_FRONTEND=noninteractive apt-get install -y $FALTAN || true
    fi
fi

# ── 6. Neurona nodo: no apagar la pantalla ni bloquear (apagado por defecto) ─
AUTOSTART="$HOME_USUARIO/.config/autostart"
ARCHIVO="$AUTOSTART/starseed-sin-reposo.desktop"
SIN_REPOSO_ORDEN='xset s off -dpms 2>/dev/null; xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false 2>/dev/null; xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0 2>/dev/null; xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-battery -s 0 2>/dev/null; xfconf-query -c xfce4-screensaver -p /saver/enabled -s false 2>/dev/null'
if [ "$SIN_REPOSO" = "1" ]; then
    mkdir -p "$AUTOSTART"
    {
        echo "[Desktop Entry]"
        echo "Type=Application"
        echo "Name=StarSeed: sin reposo"
        echo "Comment=Neurona nodo: no apagar la pantalla ni bloquear la sesión"
        echo "X-GNOME-Autostart-enabled=true"
        echo "NoDisplay=true"
        echo "Exec=sh -c '$SIN_REPOSO_ORDEN'"
    } > "$ARCHIVO"
    chown "$USUARIO": "$ARCHIVO" 2>/dev/null || true
    if command -v runuser >/dev/null 2>&1; then
        runuser -u "$USUARIO" -- env DISPLAY="${DISPLAY:-:0}" XAUTHORITY="${XAUTHORITY:-$HOME_USUARIO/.Xauthority}" \
            sh -c "$SIN_REPOSO_ORDEN" || true
    fi
    echo "  · neurona nodo: sin reposo activado"
else
    rm -f "$ARCHIVO"
fi

echo "Listo. Cierra sesión y vuelve a entrar para que los grupos nuevos te valgan."
