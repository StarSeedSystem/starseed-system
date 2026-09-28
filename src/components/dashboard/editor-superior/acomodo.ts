/**
 * Herramientas de acomodo del editor superior — PURO.
 *
 * Todo trabaja sobre el acomodo de ESCRITORIO (12 columnas), que es el único que se guarda; las
 * demás pantallas se derivan con `acomodoPara` de `src/lib/dashboard/acomodo-pantalla.ts`.
 * Los widgets bloqueados (`settings.bloqueado`) no se mueven: el resto se acomoda a su alrededor.
 */
import type { DashboardWidget } from "../dashboard-types";
import { getSizeConstraints } from "../widget-manifest";
import { acomodoPara, type ItemRejilla, type PuntoCorte } from "@/lib/dashboard/acomodo-pantalla";

const COLUMNAS = 12;

interface Caja {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function estaBloqueado(w: Pick<DashboardWidget, "settings">): boolean {
    return w.settings?.bloqueado === true;
}

/** Bloquea o desbloquea los widgets indicados (o todos). Devuelve una lista nueva. */
export function conBloqueo(widgets: DashboardWidget[], ids: readonly string[] | "todos", bloquear: boolean): DashboardWidget[] {
    const aplica = (id: string) => ids === "todos" || ids.includes(id);
    return widgets.map((w) => {
        if (!aplica(w.id) || estaBloqueado(w) === bloquear) return w;
        const settings = { ...(w.settings || {}) };
        if (bloquear) settings.bloqueado = true;
        else delete settings.bloqueado;
        return { ...w, settings };
    });
}

export function chocan(a: Caja, b: Caja): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Primer hueco libre (de arriba abajo, de izquierda a derecha) donde cabe un w×h. */
export function mejorHueco(ocupados: readonly { layout: Caja }[], w: number, h: number, columnas = COLUMNAS): { x: number; y: number } {
    const ancho = Math.max(1, Math.min(columnas, Math.round(w)));
    const alto = Math.max(1, Math.round(h));
    const cajas = ocupados.map((o) => o.layout);
    const fondo = cajas.reduce((m, c) => Math.max(m, c.y + c.h), 0);
    for (let y = 0; y <= fondo; y++) {
        for (let x = 0; x + ancho <= columnas; x++) {
            const candidata = { x, y, w: ancho, h: alto };
            if (!cajas.some((c) => chocan(c, candidata))) return { x, y };
        }
    }
    return { x: 0, y: fondo };
}

const porLectura = (a: DashboardWidget, b: DashboardWidget) => a.layout.y - b.layout.y || a.layout.x - b.layout.x;

function conCaja(w: DashboardWidget, caja: Partial<Caja>): DashboardWidget {
    const l = w.layout;
    if ((caja.x ?? l.x) === l.x && (caja.y ?? l.y) === l.y && (caja.w ?? l.w) === l.w && (caja.h ?? l.h) === l.h) return w;
    return { ...w, layout: { ...l, ...caja } };
}

/**
 * Coloca `nuevo` donde se pidió y empuja hacia abajo lo que choque (los bloqueados no se mueven:
 * si el nuevo cae encima de uno, es el nuevo el que baja).
 */
export function colocarEmpujando(widgets: DashboardWidget[], nuevo: DashboardWidget): DashboardWidget[] {
    const fijos = widgets.filter(estaBloqueado);
    let destino = nuevo;
    while (fijos.some((f) => chocan(f.layout, destino.layout))) {
        const choque = fijos.filter((f) => chocan(f.layout, destino.layout));
        destino = conCaja(destino, { y: Math.max(...choque.map((f) => f.layout.y + f.layout.h)) });
    }
    const colocados: DashboardWidget[] = [...fijos, destino];
    const resto = widgets.filter((w) => !estaBloqueado(w)).sort(porLectura);
    const salida = new Map<string, DashboardWidget>();
    for (const w of resto) {
        let actual = w;
        let guardia = 0;
        while (guardia++ < 500) {
            const choque = colocados.filter((c) => chocan(c.layout, actual.layout));
            if (choque.length === 0) break;
            actual = conCaja(actual, { y: Math.max(...choque.map((c) => c.layout.y + c.layout.h)) });
        }
        colocados.push(actual);
        salida.set(w.id, actual);
    }
    return [...widgets.map((w) => salida.get(w.id) ?? w), destino];
}

/** Sube cada widget todo lo que pueda sin cambiar su columna (lo que la rejilla ya enseña). */
export function compactar(widgets: DashboardWidget[]): DashboardWidget[] {
    const colocados: Caja[] = widgets.filter(estaBloqueado).map((w) => w.layout);
    const salida = new Map<string, DashboardWidget>();
    for (const w of widgets.filter((x) => !estaBloqueado(x)).sort(porLectura)) {
        let y = w.layout.y;
        while (y > 0 && !colocados.some((c) => chocan(c, { ...w.layout, y: y - 1 }))) y--;
        // Si ya chocaba donde estaba (datos viejos), baja hasta quedar libre.
        while (colocados.some((c) => chocan(c, { ...w.layout, y }))) y++;
        const movido = conCaja(w, { y });
        colocados.push(movido.layout);
        salida.set(w.id, movido);
    }
    return widgets.map((w) => salida.get(w.id) ?? w);
}

function aItem(w: DashboardWidget): ItemRejilla {
    const c = getSizeConstraints(w.widget_type);
    return { i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: c.minW, minH: c.minH };
}

/**
 * Auto-acomodar: re-empaqueta en orden de lectura en el primer hueco (sin agujeros). Sin
 * bloqueados usa el mismo empaquetador que deriva las pantallas (`acomodoPara`); con bloqueados,
 * los respeta como obstáculos.
 */
export function autoAcomodar(widgets: DashboardWidget[]): DashboardWidget[] {
    if (widgets.length === 0) return widgets;
    const fijos = widgets.filter(estaBloqueado);
    if (fijos.length === 0) {
        const empaquetado = new Map(acomodoPara("lg", widgets.map(aItem)).map((it) => [it.i, it]));
        return widgets.map((w) => {
            const it = empaquetado.get(w.id);
            return it ? conCaja(w, { x: it.x, y: it.y, w: it.w, h: it.h }) : w;
        });
    }
    const colocados: { layout: Caja }[] = fijos.map((f) => ({ layout: f.layout }));
    const salida = new Map<string, DashboardWidget>();
    for (const w of widgets.filter((x) => !estaBloqueado(x)).sort(porLectura)) {
        const hueco = mejorHueco(colocados, w.layout.w, w.layout.h);
        const movido = conCaja(w, hueco);
        colocados.push({ layout: movido.layout });
        salida.set(w.id, movido);
    }
    return widgets.map((w) => salida.get(w.id) ?? w);
}

/** Cómo se verá el tablero en otra pantalla (para las miniaturas del panel de acomodo). */
export function vistaPantalla(widgets: DashboardWidget[], punto: PuntoCorte): ItemRejilla[] {
    const base = widgets.map(aItem);
    return punto === "lg" ? base : acomodoPara(punto, base);
}

/** Columnas de la rejilla para un ancho dado (mismos cortes que `grid-area.tsx`). */
export function columnasPara(ancho: number): number {
    if (ancho >= 1200) return 12;
    if (ancho >= 996) return 10;
    if (ancho >= 768) return 6;
    if (ancho >= 480) return 4;
    return 2;
}

/** true si dos listas de widgets tienen el mismo acomodo (para no apuntar cambios vacíos). */
export function mismoAcomodo(a: DashboardWidget[], b: DashboardWidget[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((w, i) => {
        const o = b[i];
        return o && o.id === w.id && o.layout.x === w.layout.x && o.layout.y === w.layout.y && o.layout.w === w.layout.w
            && o.layout.h === w.layout.h && estaBloqueado(o) === estaBloqueado(w);
    });
}
