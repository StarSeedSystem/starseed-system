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

/**
 * CTL1117I · paleta que se ofrece en los ajustes de la neurona: doce colores de luminosidad media que se leen igual sobre fondo
 * claro que oscuro (el punto, la onda y el aro del toque llevan además borde blanco). Todos `#rrggbb` en minúsculas.
 */
export const PALETA_COLOR_PUBLICO: readonly { color: string; nombre: string }[] = [
    { color: "#e5484d", nombre: "Rojo" },
    { color: "#f76b15", nombre: "Naranja" },
    { color: "#d9a400", nombre: "Ámbar" },
    { color: "#46a758", nombre: "Verde" },
    { color: "#12a594", nombre: "Turquesa" },
    { color: "#0091ff", nombre: "Azul" },
    { color: "#3e63dd", nombre: "Índigo" },
    { color: "#8e4ec6", nombre: "Violeta" },
    { color: "#d6409f", nombre: "Magenta" },
    { color: "#e93d82", nombre: "Rosa" },
    { color: "#a18072", nombre: "Barro" },
    { color: "#7d8b99", nombre: "Gris azulado" },
];

/** Lo que la persona escribe («#E5484D», «e5484d», «#e54») a `#rrggbb` en minúsculas; null si no es un color. */
export function normalizarColor(texto: unknown): string | null {
    if (typeof texto !== "string") return null;
    let t = texto.trim().toLowerCase();
    if (t.startsWith("#")) t = t.slice(1);
    if (/^[0-9a-f]{3}$/.test(t)) t = [...t].map((c) => c + c).join("");
    return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}
