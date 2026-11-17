/**
 * CTL1117H · color público de una neurona: `#rrggbb` en minúsculas. Por defecto sale de su id, igual que en Rust
 * (`color_por_defecto` de `control_ajustes.rs`): tono = (suma de los bytes UTF-8 del id × 31 + longitud) mod 360,
 * saturación 70 %, luminosidad 55 %. Las dos pruebas fijan los mismos cinco ids con los mismos cinco colores.
 */

export const RE_COLOR_PUBLICO = /^#[0-9a-f]{6}$/;

export function colorValido(c: unknown): c is string {
    return typeof c === "string" && RE_COLOR_PUBLICO.test(c);
}

export function colorPorDefecto(id: string): string {
    const bytes = new TextEncoder().encode(id);
    let suma = 0;
    for (const b of bytes) suma += b;
    const h = (suma * 31 + bytes.length) % 360;
    const s = 0.7;
    const l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const tramos: [number, number, number][] = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ];
    const [r, g, b] = tramos[Math.min(5, Math.floor(h / 60))];
    const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** El color que declaró la neurona si vale; si falta o no vale, el de su id. */
export function colorDe(id: string, declarado?: unknown): string {
    return colorValido(declarado) ? declarado : colorPorDefecto(id);
}
