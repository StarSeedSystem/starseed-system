/**
 * Navegación entre pestañas (2026-09-29) — PURO.
 *
 *  · Qué pestañas caben en la barra y cuáles pasan al menú «Más» (lista vertical): la barra
 *    nunca se convierte en una tira con scroll horizontal, y la pestaña activa siempre se ve.
 *  · Atajos de teclado: Alt+1…8 va a esa pestaña, Alt+9 a la última, Alt+[ y Alt+] a la anterior
 *    y la siguiente; con Mayús además, mueven la pestaña activa. Se leen por `code` (en el Mac,
 *    Opción cambia la tecla que se escribe pero no su código).
 *  · Deslizar en táctil: un gesto horizontal claro (rápido, largo y más horizontal que vertical)
 *    cambia de pestaña; lo demás es scroll.
 */

// ── Barra: qué cabe ─────────────────────────────────────────────────────────

/** Ancho estimado de una pestaña (icono + nombre + márgenes) antes de poder medirla. */
export function anchoEstimado(nombre: string, maxCaracteres = 22): number {
    const n = Math.min(Array.from(nombre).length, maxCaracteres);
    return Math.round(40 + n * 7.4);
}

export interface Reparto {
    /** Índices (en el orden de la lista) de las pestañas que se ven en la barra. */
    visibles: number[];
    /** Índices de las que van al menú «Más». */
    ocultas: number[];
}

/**
 * Reparte las pestañas entre la barra y el menú «Más». `anchos[i]` es el ancho de la pestaña i;
 * `disponible` el hueco de la barra; `anchoMas` lo que ocupa el botón «Más». Si todas caben, no hay
 * botón. Si no, entran las primeras que quepan dejando sitio al botón, y la activa ocupa el último
 * sitio si se había quedado fuera. Un `disponible` de 0 o menos (aún sin medir) = caben todas.
 */
export function repartirPestanas(anchos: readonly number[], disponible: number, activo: number, anchoMas = 88, gap = 2): Reparto {
    const n = anchos.length;
    const todas = anchos.map((_, i) => i);
    if (!(disponible > 0) || n === 0) return { visibles: todas, ocultas: [] };
    const total = anchos.reduce((s, a) => s + a, 0) + gap * Math.max(0, n - 1);
    if (total <= disponible) return { visibles: todas, ocultas: [] };

    const hueco = disponible - anchoMas - gap;
    const visibles: number[] = [];
    let usado = 0;
    for (let i = 0; i < n; i++) {
        const a = anchos[i] + (visibles.length ? gap : 0);
        if (usado + a > hueco) break;
        visibles.push(i);
        usado += a;
    }
    if (activo >= 0 && activo < n && !visibles.includes(activo)) {
        // La activa entra quitando las últimas que hagan falta.
        while (visibles.length && usado + anchos[activo] + gap > hueco) {
            const fuera = visibles.pop()!;
            usado -= anchos[fuera] + (visibles.length ? gap : 0);
        }
        visibles.push(activo);
        visibles.sort((a, b) => a - b);
    }
    const setVisibles = new Set(visibles);
    return { visibles, ocultas: todas.filter((i) => !setVisibles.has(i)) };
}

// ── Atajos ──────────────────────────────────────────────────────────────────

export type AccionAtajo =
    | { tipo: "ir"; indice: number }
    | { tipo: "mover"; direccion: -1 | 1 };

export interface TeclaAtajo {
    code: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}

/** Qué hace una combinación de teclas en una barra de `total` pestañas con la `actual` activa. */
export function accionDeAtajo(e: TeclaAtajo, total: number, actual: number): AccionAtajo | null {
    if (!e.altKey || e.ctrlKey || e.metaKey || total <= 0) return null;
    const digito = /^Digit([1-9])$/.exec(e.code);
    if (digito && !e.shiftKey) {
        const n = Number(digito[1]);
        return { tipo: "ir", indice: n === 9 ? total - 1 : Math.min(n - 1, total - 1) };
    }
    const dir = e.code === "BracketLeft" ? -1 : e.code === "BracketRight" ? 1 : 0;
    if (!dir) return null;
    if (e.shiftKey) return { tipo: "mover", direccion: dir };
    const base = actual >= 0 ? actual : 0;
    return { tipo: "ir", indice: (base + dir + total) % total };
}

// ── Deslizar ────────────────────────────────────────────────────────────────

export const DESLIZAR_MIN_PX = 72;
export const DESLIZAR_MAX_MS = 700;

/**
 * Decide un gesto: 1 = pestaña siguiente (se desliza hacia la izquierda), -1 = anterior, 0 = nada.
 */
export function decidirDeslizamiento(g: { dx: number; dy: number; ms: number }): -1 | 0 | 1 {
    const { dx, dy, ms } = g;
    if (!(ms > 0) || ms > DESLIZAR_MAX_MS) return 0;
    if (Math.abs(dx) < DESLIZAR_MIN_PX) return 0;
    if (Math.abs(dx) < Math.abs(dy) * 2) return 0;
    return dx < 0 ? 1 : -1;
}

/** Índice vecino con vuelta (para el deslizamiento): nunca sale de la lista. */
export function vecino(actual: number, direccion: -1 | 1, total: number): number {
    if (total <= 0) return -1;
    return ((actual < 0 ? 0 : actual) + direccion + total) % total;
}
