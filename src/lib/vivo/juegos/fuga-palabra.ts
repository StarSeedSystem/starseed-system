/**
 * Detección de fugas de la palabra secreta del Dibujo-adivina: ¿aparece la palabra dentro de un
 * texto que se muestra a quien adivina? Debe pillarla también PEGADA a otras palabras
 * («Beto» + «vela» → «Betovela», donde `\b` no hay límite de palabra), que es exactamente la
 * forma en la que `textContent` concatena el autor con el intento sin separador.
 */
import { normalizarPalabra } from "./palabras";

/** ¿El texto (aunque sea `null` de un elemento ausente) hace visible la palabra? */
export function contieneFuga(texto: string | null, palabra: string): boolean {
    const t = normalizarPalabra(texto ?? "");
    const p = normalizarPalabra(palabra);
    return t.length > 0 && p.length > 0 && t.includes(p);
}
