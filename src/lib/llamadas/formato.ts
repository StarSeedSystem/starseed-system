/**
 * Textos y formatos de las llamadas — PURO.
 */
import type { TipoLlamada } from "@/lib/mensajeria/formato-tipos";

export const TIPOS_LLAMADA: TipoLlamada[] = ["audio", "video", "sala-vr", "sala-ar"];

export const TEXTO_TIPO: Record<TipoLlamada, { nombre: string; accion: string; ayuda: string }> = {
    audio: { nombre: "Llamada de voz", accion: "Llamada de voz", ayuda: "Solo audio, ligera y clara" },
    video: { nombre: "Llamada de vídeo", accion: "Videollamada", ayuda: "Cámara y micro" },
    "sala-vr": {
        nombre: "Sala virtual VR",
        accion: "Sala virtual VR",
        ayuda: "Voz en directo y el espacio 3D del OS; entra con tu visor",
    },
    "sala-ar": {
        nombre: "Sala AR",
        accion: "Sala AR",
        ayuda: "Voz en directo y el espacio 3D sobre tu entorno (móvil con AR o visor)",
    },
};

export function esTipoLlamada(v: unknown): v is TipoLlamada {
    return typeof v === "string" && (TIPOS_LLAMADA as string[]).includes(v);
}

/** Cronómetro: «0:05», «12:34», «1:02:03». */
export function formatearDuracion(ms: number): string {
    const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, "0");
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
    return `${m}:${ss}`;
}

/** Duración en palabras para la tarjeta: «40 s», «12 min», «1 h 5 min». */
export function describirDuracion(ms: number): string {
    const total = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
    if (total < 60) return `${total} s`;
    const minutos = Math.round(total / 60);
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

export function textoPersonas(n: number): string {
    return n === 1 ? "1 persona" : `${n} personas`;
}

/** Iniciales para el avatar sin foto («Ana Ruiz» → «AR»). */
export function iniciales(nombre: string): string {
    const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "·";
    const a = partes[0][0] ?? "";
    const b = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
    return (a + b).toUpperCase();
}

/** Color estable por persona (para el halo del avatar), de la paleta Trinity del OS. */
const PALETA = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#14B8A6", "#EC4899", "#DC143C", "#39FF14"];
export function colorDePersona(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
}
