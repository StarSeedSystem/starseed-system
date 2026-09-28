/**
 * Geometría y operaciones del lienzo del mensaje (puro): crear elementos con tamaños sensatos,
 * mover con rejilla, escalar desde una esquina (girado o no, con proporción opcional), girar con
 * imanes, orden de capas, duplicar y cambiar el tamaño del lienzo.
 */
import { nuevoIdElemento, PRESETS_LIENZO, type PresetLienzo } from "@/lib/mensajeria/formato";
import type { ElementoLienzo, LienzoMensaje, TipoElementoLienzo } from "@/lib/mensajeria/formato-tipos";

export const PASO_REJILLA = 10;
export const TAMANO_MINIMO = 12;

export function lienzoVacio(preset: PresetLienzo = "cuadrado"): LienzoMensaje {
    const p = PRESETS_LIENZO.find((x) => x.id === preset) ?? PRESETS_LIENZO[0];
    return { ancho: p.ancho, alto: p.alto, elementos: [] };
}

export function presetDe(l: Pick<LienzoMensaje, "ancho" | "alto">): PresetLienzo | null {
    return PRESETS_LIENZO.find((p) => p.ancho === l.ancho && p.alto === l.alto)?.id ?? null;
}

export function ajustar(v: number, paso = PASO_REJILLA): number {
    return Math.round(v / paso) * paso;
}

export function zMaxima(elementos: ElementoLienzo[]): number {
    return elementos.reduce((m, e) => Math.max(m, e.z), 0);
}

/** Tamaño inicial de cada tipo, centrado en el lienzo. */
export function crearElemento(tipo: TipoElementoLienzo, lienzo: LienzoMensaje, datos: Partial<ElementoLienzo> = {}): ElementoLienzo {
    const { ancho: A, alto: H } = lienzo;
    const lado = Math.min(A, H);
    let w: number;
    let h: number;
    switch (tipo) {
        case "texto":
            w = A * 0.8;
            h = Math.max(90, H * 0.2);
            break;
        case "imagen":
        case "gif":
            w = lado * 0.7;
            h = lado * 0.7;
            break;
        case "video":
            w = A * 0.84;
            h = (w * 9) / 16;
            break;
        case "audio":
            w = Math.max(300, A * 0.8);
            h = 170;
            break;
        case "web":
            w = A * 0.9;
            h = H * 0.62;
            break;
        case "app":
            w = A * 0.8;
            h = Math.max(260, H * 0.5);
            break;
        case "vivo":
            w = A * 0.86;
            h = Math.max(220, H * 0.42);
            break;
        case "archivo":
            w = Math.max(300, A * 0.8);
            h = 120;
            break;
        case "forma":
            w = lado * 0.32;
            h = datos.forma?.tipo === "linea" ? 24 : lado * 0.32;
            break;
    }
    w = Math.round(Math.min(w, A));
    h = Math.round(Math.min(h, H));
    const el: ElementoLienzo = {
        id: nuevoIdElemento(),
        tipo,
        x: Math.round((A - w) / 2),
        y: Math.round((H - h) / 2),
        w,
        h,
        z: zMaxima(lienzo.elementos) + 1,
        ...datos,
    };
    if (tipo === "texto" && !el.texto) el.texto = { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Escribe aquí" }] }] };
    if (tipo === "texto" && !el.estilo) el.estilo = { tamano: Math.max(16, Math.min(64, Math.round(A / 17))), alineacion: "centro" };
    if (tipo === "forma" && !el.forma) el.forma = { tipo: "rect", color: "#7c5cff" };
    return el;
}

/** Ajusta el alto a la proporción real de una imagen/vídeo sin salirse del lienzo. */
export function ajustarProporcion(el: ElementoLienzo, proporcion: number, lienzo: LienzoMensaje): ElementoLienzo {
    if (!Number.isFinite(proporcion) || proporcion <= 0) return el;
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    let w = el.w;
    let h = w * proporcion;
    const maxH = lienzo.alto * 0.9;
    if (h > maxH) {
        h = maxH;
        w = h / proporcion;
    }
    return { ...el, w: Math.round(w), h: Math.round(h), x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) };
}

export function mover(el0: ElementoLienzo, dx: number, dy: number, rejilla: boolean): ElementoLienzo {
    let x = el0.x + dx;
    let y = el0.y + dy;
    if (rejilla) {
        x = ajustar(x);
        y = ajustar(y);
    }
    return { ...el0, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function rotarVector(x: number, y: number, grados: number): [number, number] {
    const r = (grados * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [x * c - y * s, x * s + y * c];
}

/**
 * Escala desde una esquina (sx, sy ∈ {-1, 1}) con el desplazamiento del puntero (dx, dy) en unidades
 * del lienzo. La esquina opuesta queda fija aunque el elemento esté girado.
 */
export function escalar(el0: ElementoLienzo, sx: -1 | 1, sy: -1 | 1, dx: number, dy: number, proporcional: boolean): ElementoLienzo {
    const rot = el0.rot ?? 0;
    const [lx, ly] = rotarVector(dx, dy, -rot);
    let w = Math.max(TAMANO_MINIMO, el0.w + sx * lx);
    let h = Math.max(TAMANO_MINIMO, el0.h + sy * ly);
    if (proporcional) {
        const f = Math.max(w / el0.w, h / el0.h);
        w = Math.max(TAMANO_MINIMO, el0.w * f);
        h = Math.max(TAMANO_MINIMO, el0.h * f);
    }
    const [cdx, cdy] = rotarVector((sx * (w - el0.w)) / 2, (sy * (h - el0.h)) / 2, rot);
    const cx = el0.x + el0.w / 2 + cdx;
    const cy = el0.y + el0.h / 2 + cdy;
    const r = (n: number) => Math.round(n * 10) / 10;
    return { ...el0, w: r(w), h: r(h), x: r(cx - w / 2), y: r(cy - h / 2) };
}

/** Ángulo (grados, -180..180] para que el asa superior apunte al puntero; con imanes. */
export function anguloHacia(cx: number, cy: number, px: number, py: number, pasos15: boolean): number {
    let a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
    a = ((a + 540) % 360) - 180;
    if (pasos15) a = Math.round(a / 15) * 15;
    else {
        for (const iman of [-180, -90, 0, 90, 180]) if (Math.abs(a - iman) < 4) a = iman;
    }
    if (a <= -180) a += 360;
    return Math.round(a * 10) / 10;
}

export function normalizarZ(elementos: ElementoLienzo[]): ElementoLienzo[] {
    const orden = [...elementos].sort((a, b) => a.z - b.z);
    const z = new Map(orden.map((e, i) => [e.id, i + 1]));
    return elementos.map((e) => ({ ...e, z: z.get(e.id)! }));
}

export type MovimientoCapa = "frente" | "adelante" | "atras" | "fondo";

export function moverCapa(elementos: ElementoLienzo[], id: string, mov: MovimientoCapa): ElementoLienzo[] {
    const orden = [...normalizarZ(elementos)].sort((a, b) => a.z - b.z);
    const i = orden.findIndex((e) => e.id === id);
    if (i < 0) return elementos;
    const [el] = orden.splice(i, 1);
    const destino = mov === "frente" ? orden.length : mov === "fondo" ? 0 : mov === "adelante" ? Math.min(orden.length, i + 1) : Math.max(0, i - 1);
    orden.splice(destino, 0, el);
    const z = new Map(orden.map((e, k) => [e.id, k + 1]));
    return elementos.map((e) => ({ ...e, z: z.get(e.id)! }));
}

export function duplicar(lienzo: LienzoMensaje, id: string): { lienzo: LienzoMensaje; nuevoId: string | null } {
    const el = lienzo.elementos.find((e) => e.id === id);
    if (!el) return { lienzo, nuevoId: null };
    const copia: ElementoLienzo = {
        ...structuredCloneSeguro(el),
        id: nuevoIdElemento(),
        x: el.x + 20,
        y: el.y + 20,
        z: zMaxima(lienzo.elementos) + 1,
        bloqueado: undefined,
    };
    return { lienzo: { ...lienzo, elementos: [...lienzo.elementos, copia] }, nuevoId: copia.id };
}

function structuredCloneSeguro<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

/** Cambia el tamaño del lienzo conservando la composición centrada. */
export function cambiarTamano(lienzo: LienzoMensaje, preset: PresetLienzo): LienzoMensaje {
    const p = PRESETS_LIENZO.find((x) => x.id === preset);
    if (!p || (p.ancho === lienzo.ancho && p.alto === lienzo.alto)) return lienzo;
    const dx = (p.ancho - lienzo.ancho) / 2;
    const dy = (p.alto - lienzo.alto) / 2;
    return {
        ...lienzo,
        ancho: p.ancho,
        alto: p.alto,
        elementos: lienzo.elementos.map((e) => ({ ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) })),
    };
}

export function actualizarElemento(lienzo: LienzoMensaje, id: string, cambio: Partial<ElementoLienzo> | ((el: ElementoLienzo) => ElementoLienzo)): LienzoMensaje {
    return {
        ...lienzo,
        elementos: lienzo.elementos.map((e) => (e.id === id ? (typeof cambio === "function" ? cambio(e) : { ...e, ...cambio }) : e)),
    };
}

export function quitarElemento(lienzo: LienzoMensaje, id: string): LienzoMensaje {
    return { ...lienzo, elementos: lienzo.elementos.filter((e) => e.id !== id) };
}
