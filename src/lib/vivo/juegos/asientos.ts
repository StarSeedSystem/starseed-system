/**
 * Cómo se llama y de qué color es cada asiento en cada juego (para la interfaz), y utilidades
 * pequeñas de presentación: color estable por persona, iniciales. Puro.
 */
import type { IdJuego } from "./tipos";

export interface EtiquetaAsiento {
    /** «Blancas», «X»… */
    nombre: string;
    /** Color de acento del asiento (siempre legible sobre el vidrio oscuro). */
    color: string;
    /** Color del texto sobre `color`. */
    tinta: string;
}

const AJEDREZ: EtiquetaAsiento[] = [
    { nombre: "Blancas", color: "#F1F5F9", tinta: "#0B0D1F" },
    { nombre: "Negras", color: "#1A1740", tinta: "#F1F5F9" },
];
const TRES: EtiquetaAsiento[] = [
    { nombre: "X", color: "#9B84FF", tinta: "#0B0D1F" },
    { nombre: "O", color: "#39FF14", tinta: "#0B0D1F" },
];
const C4: EtiquetaAsiento[] = [
    { nombre: "Rojas", color: "#FF4D6D", tinta: "#0B0D1F" },
    { nombre: "Amarillas", color: "#FFD23F", tinta: "#0B0D1F" },
];
const CICLO_DIBUJO = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#EC4899", "#14B8A6", "#DC143C", "#39FF14"];

export function etiquetaAsiento(juego: IdJuego | string, asiento: number): EtiquetaAsiento {
    if (juego === "ajedrez") return AJEDREZ[asiento] ?? AJEDREZ[0];
    if (juego === "tres-en-raya") return TRES[asiento] ?? TRES[0];
    if (juego === "conecta-4") return C4[asiento] ?? C4[0];
    const color = CICLO_DIBUJO[((asiento % CICLO_DIBUJO.length) + CICLO_DIBUJO.length) % CICLO_DIBUJO.length];
    return { nombre: `Asiento ${asiento + 1}`, color, tinta: "#0B0D1F" };
}

/** Color estable para el avatar de una persona (mismo uid, mismo color). */
export function colorDePersona(uid: string): string {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return CICLO_DIBUJO[h % CICLO_DIBUJO.length];
}

export function inicialesDe(nombre: string): string {
    const partes = nombre.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    const a = Array.from(partes[0])[0] ?? "?";
    const b = partes.length > 1 ? (Array.from(partes[partes.length - 1])[0] ?? "") : "";
    return (a + b).toUpperCase();
}
