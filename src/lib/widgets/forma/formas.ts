/**
 * Formas de los widgets libres (Ola 380 · FL1) — PURO, sin DOM.
 *
 * Un widget ya no es una caja: es una forma. `trazoForma` devuelve el atributo `d` de un path
 * SVG cerrado dentro de 0..w × 0..h (margen del 4 %) que sirve de silueta, máscara o halo.
 * Todo es determinista: la misma semilla da siempre el mismo cristal o la misma mancha, así un
 * widget no «cambia de cara» en cada render ni entre neuronas.
 */

export type TipoForma =
    | "ninguna" | "orbe" | "gota" | "hexagono" | "petalo" | "cristal"
    | "onda" | "orbita" | "capsula" | "estrella" | "mancha";

export const FORMAS: readonly TipoForma[] = [
    "ninguna", "orbe", "gota", "hexagono", "petalo", "cristal",
    "onda", "orbita", "capsula", "estrella", "mancha",
];

type P = [number, number];

/** FNV-1a de 32 bits: hash estable de una cadena. */
export function hashCadena(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** mulberry32: aleatorio reproducible a partir de la semilla. */
function aleatorio(semilla: string): () => number {
    let a = hashCadena(semilla) || 1;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const pt = ([x, y]: P) => `${n(x)} ${n(y)}`;
const poligono = (ps: P[]) => `M${pt(ps[0])}${ps.slice(1).map((p) => `L${pt(p)}`).join("")}Z`;

export function trazoForma(tipo: TipoForma, w: number, h: number, semilla = "starseed"): string {
    if (!(w > 0) || !(h > 0)) return "";
    const m = Math.min(w, h) * 0.04;
    const [x0, y0, x1, y1] = [m, m, w - m, h - m];
    const cx = w / 2, cy = h / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, r = Math.min(rx, ry);
    const alrededor = (k: number, radio: (i: number) => number, desfase = -90): P[] =>
        Array.from({ length: k }, (_, i) => {
            const a = ((desfase + (360 / k) * i) * Math.PI) / 180;
            return [cx + Math.cos(a) * radio(i) * (rx / r), cy + Math.sin(a) * radio(i) * (ry / r)];
        });
    const elipse = (a: number, b: number) =>
        `M${n(cx - a)} ${n(cy)}A${n(a)} ${n(b)} 0 1 0 ${n(cx + a)} ${n(cy)}A${n(a)} ${n(b)} 0 1 0 ${n(cx - a)} ${n(cy)}Z`;

    switch (tipo) {
        case "ninguna":
            return `M0 0H${n(w)}V${n(h)}H0Z`;
        case "orbe":
            return elipse(rx, ry);
        case "orbita": {
            const g = Math.min(w, h) * 0.18;
            return elipse(rx, ry) + elipse(Math.max(1, rx - g), Math.max(1, ry - g));
        }
        case "gota": {
            const rg = Math.min(rx / 1.35, ry * 0.6), cg = y1 - rg;
            return `M${n(cx)} ${n(y0)}Q${n(cx + rg * 1.35)} ${n(cg - rg * 0.2)} ${n(cx + rg)} ${n(cg)}` +
                `A${n(rg)} ${n(rg)} 0 1 1 ${n(cx - rg)} ${n(cg)}Q${n(cx - rg * 1.35)} ${n(cg - rg * 0.2)} ${n(cx)} ${n(y0)}Z`;
        }
        case "hexagono":
            return poligono(Array.from({ length: 6 }, (_, i) => {
                const a = ((-90 + 60 * i) * Math.PI) / 180;
                return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P;
            }));
        case "petalo":
            return poligono(Array.from({ length: 48 }, (_, i) => {
                const t = (i / 48) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
                return [cx + rx * Math.sign(c) * Math.abs(c) ** 0.5, cy + ry * Math.sign(s) * Math.abs(s) ** 0.5] as P;
            }));
        case "cristal": {
            const rnd = aleatorio(semilla), k = 7 + Math.floor(rnd() * 3), paso = 360 / k;
            return poligono(Array.from({ length: k }, (_, i) => {
                const a = ((-90 + paso * i + (rnd() - 0.5) * paso * 0.5) * Math.PI) / 180, f = 0.78 + rnd() * 0.22;
                return [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f] as P;
            }));
        }
        case "onda": {
            const a = (y1 - y0) * 0.06, pasos = 24, per = 2;
            const arriba: P[] = Array.from({ length: pasos + 1 }, (_, i) =>
                [x0 + ((x1 - x0) * i) / pasos, y0 + a + a * Math.sin((i / pasos) * Math.PI * 2 * per)]);
            const abajo: P[] = Array.from({ length: pasos + 1 }, (_, i) =>
                [x1 - ((x1 - x0) * i) / pasos, y1 - a - a * Math.sin((i / pasos) * Math.PI * 2 * per + Math.PI)]);
            return poligono([...arriba, ...abajo]);
        }
        case "capsula": {
            if (x1 - x0 >= y1 - y0) {
                const rc = ry;
                return `M${n(x0 + rc)} ${n(y0)}H${n(x1 - rc)}A${n(rc)} ${n(rc)} 0 0 1 ${n(x1 - rc)} ${n(y1)}H${n(x0 + rc)}A${n(rc)} ${n(rc)} 0 0 1 ${n(x0 + rc)} ${n(y0)}Z`;
            }
            const rc = rx;
            return `M${n(x0)} ${n(y0 + rc)}A${n(rc)} ${n(rc)} 0 0 1 ${n(x1)} ${n(y0 + rc)}V${n(y1 - rc)}A${n(rc)} ${n(rc)} 0 0 1 ${n(x0)} ${n(y1 - rc)}Z`;
        }
        case "estrella": {
            const en = (ang: number, radio: number): P => [cx + Math.cos((ang * Math.PI) / 180) * radio, cy + Math.sin((ang * Math.PI) / 180) * radio];
            let d = `M${pt(en(-120, r * 0.62))}`;
            for (let k = 0; k < 6; k++) d += `Q${pt(en(-90 + 60 * k, r))} ${pt(en(-60 + 60 * k, r * 0.62))}`;
            return d + "Z";
        }
        case "mancha": {
            const rnd = aleatorio(semilla);
            const ps = alrededor(8, () => r * (0.72 + rnd() * 0.28));
            const dentro = ([x, y]: P): P => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))];
            let d = `M${pt(ps[0])}`;
            for (let i = 0; i < ps.length; i++) {
                const [p0, p1, p2, p3] = [ps[(i + 7) % 8], ps[i], ps[(i + 1) % 8], ps[(i + 2) % 8]];
                const c1 = dentro([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]);
                const c2 = dentro([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]);
                d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
            }
            return d + "Z";
        }
    }
}

/** Formas que piden un hueco cuadrado para lucir (el resto se estira con el widget). */
export function relacionForma(tipo: TipoForma): "cuadrada" | "libre" {
    return tipo === "orbe" || tipo === "hexagono" || tipo === "orbita" || tipo === "estrella" ? "cuadrada" : "libre";
}
