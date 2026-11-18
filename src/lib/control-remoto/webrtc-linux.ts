/**
 * CTL1118M · «WebRTC en Linux, dicho con claridad». Módulo PURO.
 *
 * WebKitGTK tiene WebRTC apagado de fábrica; la app lo enciende (`encender_medios_linux`), pero necesita GStreamer del SISTEMA (el AppImage no
 * lo lleva: no hay `bundleMediaFramework` en tauri.conf.json): `nice` para el ICE y `plugins-bad` para `webrtcbin`/DTLS. Sin ellos `RTCPeerConnection`
 * puede existir y no conectar nunca. Aquí se decide si hay que decirlo y con qué texto/orden; nada se instala solo.
 */

export const ORDEN_APT_WEBRTC = "su -c 'apt-get install -y gstreamer1.0-nice gstreamer1.0-plugins-bad'";
export const FALTA_WEBRTC_LINUX = "webrtc-linux";

export interface EstadoWebrtcLinux {
    linux: boolean;
    /** false = no hay `gst-inspect-1.0`: no se sabe, no se acusa a nadie. */
    sabido: boolean;
    faltan: string[];
}

/** ¿Falta WebRTC utilizable en ESTE aparato? Sin `RTCPeerConnection` siempre; con él, solo si lo nativo dice que faltan elementos. */
export function faltaWebrtcLinux(o: { linux: boolean; hayPeer: boolean; nativo: EstadoWebrtcLinux | null }): boolean {
    if (!o.linux) return false;
    if (!o.hayPeer) return true;
    return !!o.nativo && o.nativo.sabido && o.nativo.faltan.length > 0;
}

/** Línea para enlaces.log (clave=valor, sin comillas ni datos de la persona). */
export function lineaWebrtcLinux(o: { hayPeer: boolean; nativo: EstadoWebrtcLinux | null }): string {
    const f = o.nativo?.faltan.filter((x) => /^[a-z0-9]{3,24}$/.test(x)).slice(0, 8).join(",") || "ninguno";
    return `llamada webrtc-linux peer=${o.hayPeer ? "si" : "no"} gstreamer=${o.nativo ? (o.nativo.sabido ? "medido" : "sin-gst-inspect") : "sin-dato"} faltan=${f} orden=${ORDEN_APT_WEBRTC}`;
}

export function esLinuxEscritorio(ua: string | undefined): boolean {
    return !!ua && /Linux|X11/i.test(ua) && !/Android/i.test(ua);
}
