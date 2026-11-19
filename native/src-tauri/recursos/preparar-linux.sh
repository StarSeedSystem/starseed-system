#!/bin/sh
# preparar-linux.sh — deja este Linux listo para ser una neurona del nodo StarSeed (LNX1118WD).
#
# Lo lanza la app con pkexec: el diálogo del sistema es el permiso. Nada corre como root sin él.
# Idempotente: se puede lanzar las veces que haga falta y solo cambia lo que falta.
# Sin red, salvo apt para los dos paquetes de GStreamer (solo si faltan y hay apt).
#
# Lo que hace (lo que antes se hacía a mano en el nodo):
#   · añade tu cuenta a los grupos netdev, bluetooth, audio, video, render, input, plugdev y dialout;
#   · pone /dev/uinput para el grupo input (regla udev + módulo del núcleo);
#   · deja que el grupo netdev gestione NetworkManager (regla de polkit);
#   · enciende el servicio Bluetooth;
#   · instala gstreamer1.0-nice y gstreamer1.0-plugins-bad si no están (solo con apt);
#   · con --sin-reposo, apaga el reposo y el bloqueo de pantalla; con --con-reposo, los devuelve
#     (--solo-reposo hace únicamente eso, sin volver a tocar grupos, udev, polkit ni paquetes).
#
# Aviso que la persona ve antes de aceptar: hay que CERRAR SESIÓN para que los grupos entren.

set -eu

GRUPOS="netdev bluetooth audio video render input plugdev dialout"
SIN_REPOSO=0
SOLO_REPOSO=0
for argumento in "$@"; do
    case "$argumento" in
        --sin-reposo) SIN_REPOSO=1 ;;
        --con-reposo) SIN_REPOSO=0 ;;
        --solo-reposo) SOLO_REPOSO=1 ;;
    esac
done

UID_PERSONA=${PKEXEC_UID:-${SUDO_UID:-}}
if [ -z "${UID_PERSONA:-}" ]; then
    echo "No sé qué persona ha pedido preparar este equipo (falta PKEXEC_UID)." >&2
    exit 1
fi
PERSONA=$(getent passwd "$UID_PERSONA" | cut -d: -f1)
CASA=$(getent passwd "$UID_PERSONA" | cut -d: -f6)
if [ -z "${PERSONA:-}" ] || [ -z "${CASA:-}" ]; then
    echo "La cuenta $UID_PERSONA no existe en este equipo." >&2
    exit 1
fi
if [ "$SOLO_REPOSO" = "0" ]; then
echo "[1/6] Cuenta: $PERSONA ($CASA)"

# ── 1. Grupos del nodo ───────────────────────────────────────────────────────
for grupo in $GRUPOS; do
    if ! getent group "$grupo" >/dev/null 2>&1; then
        groupadd --system "$grupo" >/dev/null 2>&1 || true
    fi
    usermod -aG "$grupo" "$PERSONA" >/dev/null 2>&1 || true
done
echo "[2/6] Grupos del nodo: $GRUPOS"

# ── 2. /dev/uinput para el grupo input (botón y teclado virtuales) ───────────
REGLAS_UDEV=/etc/udev/rules.d/99-starseed-uinput.rules
MODULO=/etc/modules-load.d/starseed-uinput.conf
printf '%s\n' 'KERNEL=="uinput", SUBSYSTEM=="misc", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"' > "$REGLAS_UDEV"
printf '%s\n' uinput > "$MODULO"
modprobe uinput >/dev/null 2>&1 || true
udevadm control --reload-rules >/dev/null 2>&1 || true
udevadm trigger --name-match=uinput >/dev/null 2>&1 || true
echo "[3/6] /dev/uinput preparado para el grupo input"

# ── 3. Red: el grupo netdev gestiona NetworkManager ─────────────────────────
mkdir -p /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/50-starseed-netdev.rules <<'POLKIT'
polkit.addRule(function(action, subject) {
    if (action.id.indexOf("org.freedesktop.NetworkManager.") === 0 && subject.isInGroup("netdev")) {
        return polkit.Result.YES;
    }
});
POLKIT
echo "[4/6] NetworkManager abierto al grupo netdev (polkit)"

# ── 4. Bluetooth encendido ──────────────────────────────────────────────────
systemctl enable --now bluetooth.service >/dev/null 2>&1 || systemctl enable --now bluetooth >/dev/null 2>&1 || true
echo "[5/6] Servicio Bluetooth encendido"

# ── 5. GStreamer de WebRTC: solo si falta y hay apt (nada de red si ya está) ─
if command -v gst-inspect-1.0 >/dev/null 2>&1; then
    if ! gst-inspect-1.0 --exists webrtcbin >/dev/null 2>&1 || ! gst-inspect-1.0 --exists nicesrc >/dev/null 2>&1; then
        if command -v apt-get >/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
                gstreamer1.0-nice gstreamer1.0-plugins-bad >/dev/null 2>&1 || true
        fi
    fi
fi
echo "[6/6] GStreamer de WebRTC comprobado"
fi

# ── 6. Sin reposo (opcional, apagado por defecto) ───────────────────────────
ARRANQUE_AUTO="$CASA/.config/autostart"
FICHERO_SIN_REPOSO="$ARRANQUE_AUTO/starseed-sin-reposo.desktop"
if [ "$SIN_REPOSO" = "1" ]; then
    mkdir -p "$ARRANQUE_AUTO"
    cat > "$FICHERO_SIN_REPOSO" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=StarSeed OS · sin reposo
Comment=Neurona nodo: no apagar la pantalla ni bloquear (StarSeed OS)
Exec=sh -c 'xset s off -dpms; xset s noblank'
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
DESKTOP
    chown "$PERSONA" "$FICHERO_SIN_REPOSO" 2>/dev/null || true
    su "$PERSONA" -c "DISPLAY=${DISPLAY:-:0} xset s off -dpms >/dev/null 2>&1 || true" || true
    echo "Sin reposo activado para $PERSONA."
else
    rm -f "$FICHERO_SIN_REPOSO"
    su "$PERSONA" -c "DISPLAY=${DISPLAY:-:0} xset s on +dpms >/dev/null 2>&1 || true" || true
    echo "Reposo normal (sin cambios)."
fi

echo "Listo. Cierra sesión y vuelve a entrar para que los grupos nuevos entren en vigor."
