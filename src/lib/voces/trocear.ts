/**
 * Troceado de texto para síntesis en la nube (Ola 279 · V8B · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Translate TTS (`/translate_tts`) limita la longitud de cada petición;
 * para que un texto largo suene entero, el servidor lo parte en trozos de
 * ≤ `max` caracteres cortando SIEMPRE por una frontera de palabra (primero por
 * frases —puntuación fuerte seguida de espacio—, luego por comas y por último
 * por espacios), de modo que ninguna palabra quede cortada a la mitad.
 *
 * Es una función pura y exportada aparte del `route.ts` (que arrastra
 * `next/server` y contexto de petición) para poder probarla con Vitest en
 * entorno `node` sin red ni mocks.
 */

/** Devuelve el índice del último corte admisible dentro de los primeros `max` caracteres. */
function ultimoCorte(s: string, max: number): number {
    const ventana = s.slice(0, max);
    let corte = -1;
    let m: RegExpExecArray | null;
    // 1) Frase: puntuación fuerte (`. ! ? ; :`) seguida de espacio.
    const frase = /[.!?;:](?=\s)/g;
    while ((m = frase.exec(ventana)) !== null) corte = m.index;
    if (corte >= 0) return corte + 1; // incluye la puntuación, no el espacio.
    // 2) Coma seguida de espacio.
    const coma = /,(?=\s)/g;
    while ((m = coma.exec(ventana)) !== null) corte = m.index;
    if (corte >= 0) return corte + 1;
    // 3) Cualquier espacio.
    const espacio = /\s/g;
    while ((m = espacio.exec(ventana)) !== null) corte = m.index;
    if (corte >= 0) return corte + 1;
    // Sin frontera: palabra más larga que `max`; se parte forzada (caso límite).
    return -1;
}

/** Parte un texto en trozos de ≤ `max` caracteres sin cortar palabras. */
export function trocearTexto(texto: string, max = 200): string[] {
    const normalizado = texto.replace(/\s+/g, " ").trim();
    const trozos: string[] = [];
    let resto = normalizado;
    while (resto.length > max) {
        const corte = ultimoCorte(resto, max);
        if (corte < 0) {
            trozos.push(resto.slice(0, max));
            resto = resto.slice(max);
        } else {
            trozos.push(resto.slice(0, corte).trim());
            resto = resto.slice(corte).trim();
        }
    }
    if (resto) trozos.push(resto);
    return trozos.filter((t) => t.length > 0);
}