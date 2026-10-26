// src/lib/social/claves-lista.ts
// ─────────────────────────────────────────────────────────────────────────────
// Claves de lista estables para listas dinámicas de React (SP092937b).
//
// La key de React debe identificar al ELEMENTO, no a su posición: usar el
// índice rompe la reconciliación al reordenar (el estado de la fila 0 se queda
// con lo que antes era de la fila 1), y usar un nombre suelto colisiona en
// cuanto hay dos entradas con el mismo nombre. Aquí la clave se deriva del
// CONTENIDO (slug estable, sin acentos ni signos) y, solo cuando hay contenido
// repetido, se deshace la colisión con un sufijo ordinal determinista.
//
// Módulo puro: sin React, sin Node, sin efectos. Lo importan los toolkits de
// `src/components/social/toolkits/**` y sus pruebas.
// ─────────────────────────────────────────────────────────────────────────────

/** Trozo de contenido que puede aportar clave: texto, número o ausencia. */
export type ParteClave = string | number | undefined | null;

/**
 * Slug estable para claves: minúsculas, sin acentos, sin signos.
 * MISMA normalización que la que derivaba la papeleta de MiniVote
 * (`mvSlug`), para que las claves `mv:<slug>` guardadas en `os_gov_votes`
 * sigan siendo válidas byte a byte.
 */
export function slugDeClave(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

/**
 * Deriva una clave por elemento a partir de su contenido, no de su posición.
 * Dos elementos con el mismo contenido reciben un sufijo ordinal (`x`,
 * `x-2`, `x-3`…), que sigue al contenido al reordenar; un elemento cuyo
 * contenido no produce slug cae al índice (`fila-<i>`) como último recurso.
 */
export function clavesDeLista<T>(
    items: readonly T[],
    partesDe: (item: T) => readonly ParteClave[],
): string[] {
    const usadas = new Set<string>();
    return items.map((item, i) => {
        const base =
            slugDeClave(
                partesDe(item)
                    .filter((p) => p !== undefined && p !== null && String(p) !== "")
                    .join(":"),
            ) || `fila-${i}`;
        let clave = base;
        let n = 1;
        while (usadas.has(clave)) clave = `${base}-${++n}`;
        usadas.add(clave);
        return clave;
    });
}
