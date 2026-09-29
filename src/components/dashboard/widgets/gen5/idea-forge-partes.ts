/**
 * Incubadora de Quimeras · lógica PURA (Ola 0929-C).
 *
 * Las ideas se guardan como Notas rápidas con la etiqueta `#idea` (el mismo bloc del widget de
 * Notas, sincronizado con la cuenta): así una idea apuntada aquí también aparece allí y viaja a
 * todos tus dispositivos. La «chispa» es una herramienta creativa (dos conceptos que chocan y
 * una pregunta puente), no un dato: se elige de forma determinista por día y se puede barajar.
 */
import type { QuickNote } from "@/lib/notes/quick-notes";

export const CONCEPTOS = [
    "Micelio", "Rascacielos", "Mecánica cuántica", "Budismo zen", "Permacultura", "Inteligencia colectiva",
    "Música modal", "Criptografía", "Biomímesis", "Economía del don", "Geometría sagrada", "Robótica blanda",
    "Mareas", "Colmenas", "Asambleas", "Bibliotecas", "Semillas", "Redes mesh", "Arrecifes", "Sueños lúcidos",
    "Cartografía", "Fermentación", "Telares", "Constelaciones",
] as const;

export const PUENTES = [
    "¿Y si la estructura de uno guiara el crecimiento del otro?",
    "¿Qué patrón comparten los dos sistemas?",
    "Usa el segundo como metáfora operativa del primero.",
    "¿Qué nace si los fundes en un único organismo?",
    "Diseña un ritual que honre la tensión entre ambos.",
    "Traduce las reglas de uno al lenguaje del otro.",
    "¿Qué problema del primero resuelve la lógica del segundo?",
    "¿Cómo sería una herramienta comunitaria hecha de los dos?",
] as const;

export interface Chispa { a: string; b: string; puente: string }

/** Generador determinista (Park–Miller). */
function azar(semilla: number): () => number {
    let s = Math.abs(Math.floor(semilla)) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** La chispa del día `dia` (días desde 1970), barajada `vuelta` veces. */
export function chispa(dia: number, vuelta = 0): Chispa {
    const r = azar(dia * 7919 + vuelta * 104729 + 17);
    const i = Math.floor(r() * CONCEPTOS.length);
    let j = Math.floor(r() * (CONCEPTOS.length - 1));
    if (j >= i) j += 1;
    return { a: CONCEPTOS[i], b: CONCEPTOS[j], puente: PUENTES[Math.floor(r() * PUENTES.length)] };
}

export function diaDe(t: number): number {
    const d = new Date(t);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

const MARCA = /(^|\s)#idea(?=\s|$)/i;

export function esIdea(n: Pick<QuickNote, "text">): boolean {
    return MARCA.test(n.text);
}

/** El texto de la idea sin la marca `#idea`. */
export function textoIdea(texto: string): string {
    return texto.replace(/(^|\s)#idea(?=\s|$)/gi, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Texto para guardar en Notas: con la marca `#idea` una sola vez. */
export function comoNota(texto: string): string {
    const t = texto.trim();
    return !t ? t : MARCA.test(t) ? t : `${t} #idea`;
}

export function textoChispa(c: Chispa): string {
    return `${c.a} × ${c.b}: ${c.puente}`;
}

/** Título breve para llevar la idea a otra parte (propuesta, lienzo). */
export function tituloDe(texto: string, max = 70): string {
    const limpio = textoIdea(texto).split(/[\n.!?]/)[0].trim() || textoIdea(texto);
    return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

/** Ideas: ancladas primero, luego las más recientes. */
export function ideasDe(notas: QuickNote[]): QuickNote[] {
    return notas.filter(esIdea).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}
