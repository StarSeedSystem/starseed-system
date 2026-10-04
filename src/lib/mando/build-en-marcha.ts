/**
 * ¿HAY UNA BUILD DE NEXT EN MARCHA? (Ola 1004H · HG1004A) — módulo PURO
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes se usaba `pgrep -f "next build"`, que mira la línea de órdenes ENTERA:
 * un `opencode run <prompt>` del enjambre lleva en el prompt la frase
 * «next build» (las reglas del repo) y el Mando creía que había una build
 * corriendo con el disco lleno. Aquí solo cuenta si el EJECUTABLE es un
 * binario capaz de lanzar builds y `next build` aparece como argumento.
 */

/** Ejecutables cuyo nombre base habilita una build (`node`, `npx`, etc.). */
const EJECUTABLES_BUILD = new Set(["node", "next", "npx", "npm", "pnpm", "bun"]);

/** `next build`, `./next build`, `/next/dist/bin/next build` o `next.js build`. */
const PATRON_NEXT_BUILD = /(^|[\s/])next(\.js)?\s+build(\s|$)/;

/**
 * ¿Esta línea de `ps -axo args=` es de verdad una build de Next?
 * El PRIMER token (separando por espacios) es el ejecutable: solo cuentan
 * `node`, `next`, `npx`, `npm`, `pnpm` o `bun` (por nombre base), y además la
 * línea debe llevar `next build` como argumento. Cualquier otro ejecutable
 * (`opencode`, `codex`, `python3`, `zsh -c` con un texto largo…) NO cuenta,
 * aunque el texto diga «next build».
 */
export function esBuildDeNext(linea: string): boolean {
    const limpia = linea.trim();
    if (limpia.length === 0) return false;
    const primero = limpia.split(/\s+/)[0];
    if (!primero) return false;
    const base = primero.split("/").pop() ?? primero;
    if (!EJECUTABLES_BUILD.has(base)) return false;
    return PATRON_NEXT_BUILD.test(limpia);
}

/** ¿Alguna de las líneas de `ps` es una build de Next? */
export function hayBuildDeNext(lineasPs: string[]): boolean {
    return lineasPs.some(esBuildDeNext);
}
