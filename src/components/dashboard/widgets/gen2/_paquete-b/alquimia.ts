/**
 * Alquimia cívica (paquete B · Ola 0929) — PURO.
 *
 * De la queja a la propuesta: un BORRADOR a partir de tus palabras (plantilla honesta, no IA),
 * y las propuestas REALES del Ágora que se le parecen (para sumarse antes que duplicar).
 */
import type { PropuestaViva } from "./datos-civicos";

const VACIAS = new Set([
    "para", "porque", "sobre", "entre", "desde", "hasta", "donde", "cuando", "como", "este", "esta", "estos", "estas",
    "pero", "tambien", "también", "muy", "hay", "tiene", "tienen", "hacer", "falta", "nuestro", "nuestra", "todas", "todos",
    "cada", "mucho", "mucha", "poco", "poca", "algo", "nada", "siempre", "nunca", "otra", "otro", "sería", "seria", "puede",
]);

/** Palabras con sentido de un texto (sin tildes, ≥ 4 letras, sin palabras vacías). */
export function palabrasClave(texto: string): string[] {
    const limpio = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const vistas = new Set<string>();
    for (const p of limpio.split(/[^a-z0-9ñ]+/)) if (p.length >= 4 && !VACIAS.has(p)) vistas.add(p);
    return Array.from(vistas);
}

/** Borrador de propuesta a partir de una queja (se edita en Decisiones antes de enviarla). */
export function redactar(queja: string): { titulo: string; descripcion: string } {
    const limpio = queja.trim().replace(/\s+/g, " ");
    const primera = (limpio.split(/(?<=[.!?])\s/)[0] ?? limpio).replace(/[.!?]+$/, "");
    const base = primera.charAt(0).toUpperCase() + primera.slice(1);
    const titulo = base.length > 80 ? `${base.slice(0, 79).replace(/\s+\S*$/, "")}…` : base;
    const descripcion = `Problema: ${limpio}\n\nQué propongo decidir: (escribe aquí la acción concreta, quién la lleva y en qué plazo)`;
    return { titulo, descripcion };
}

/** Propuestas del Ágora que se parecen a la queja (abiertas primero). */
export function parecidas(queja: string, propuestas: PropuestaViva[], max = 3): { p: PropuestaViva; comunes: string[] }[] {
    const claves = new Set(palabrasClave(queja));
    if (claves.size === 0) return [];
    return propuestas
        .map((p) => ({ p, comunes: palabrasClave(`${p.titulo} ${p.descripcion ?? ""}`).filter((w) => claves.has(w)) }))
        .filter((x) => x.comunes.length > 0)
        .sort((a, b) => b.comunes.length - a.comunes.length || Number(b.p.estado === "open") - Number(a.p.estado === "open"))
        .slice(0, max);
}
