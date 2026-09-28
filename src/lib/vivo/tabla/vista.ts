/**
 * Vista PERSONAL de una tabla (2026-09-28): ordenar y filtrar lo que ves TÚ.
 *
 * Nada de esto viaja al documento compartido: cada persona ve la tabla como prefiera sin cambiar
 * la de las demás. Se recuerda en este dispositivo (`localStorage`, por tabla).
 */
import { crearCalculadora, type Calculadora } from "./formulas";
import {
    claveCelda,
    columnasVisibles,
    estaVacio,
    filasVisibles,
    nombreDeOpcion,
    normalizarNombre,
    numeroDesdeTexto,
    type Columna,
    type Tabla,
    type ValorCelda,
} from "./modelo";

export type OperadorFiltro = "contiene" | "igual" | "vacio" | "no-vacio" | "mayor" | "menor" | "si" | "no";

export interface Filtro {
    col: string;
    op: OperadorFiltro;
    valor: string;
}

export interface Orden {
    col: string;
    dir: "asc" | "desc";
}

export interface VistaTabla {
    orden: Orden | null;
    filtros: Filtro[];
}

export const VISTA_VACIA: VistaTabla = Object.freeze({ orden: null, filtros: [] as Filtro[] }) as VistaTabla;

export const ETIQUETA_OPERADOR: Record<OperadorFiltro, string> = {
    contiene: "contiene",
    igual: "es igual a",
    vacio: "está vacío",
    "no-vacio": "no está vacío",
    mayor: "es mayor que",
    menor: "es menor que",
    si: "está marcado",
    no: "no está marcado",
};

/** Operadores que tienen sentido para el tipo de columna. */
export function operadoresDe(col: Columna): OperadorFiltro[] {
    switch (col.tipo.v) {
        case "numero":
        case "fecha":
        case "calculado":
            return ["igual", "mayor", "menor", "vacio", "no-vacio"];
        case "casilla":
            return ["si", "no"];
        case "seleccion":
        case "persona":
            return ["igual", "vacio", "no-vacio"];
        default:
            return ["contiene", "igual", "vacio", "no-vacio"];
    }
}

export function filtroNecesitaValor(op: OperadorFiltro): boolean {
    return op === "contiene" || op === "igual" || op === "mayor" || op === "menor";
}

/** ¿Está esta vista sin nada activo? */
export function vistaVacia(v: VistaTabla): boolean {
    return !v.orden && v.filtros.length === 0;
}

/** Valor comparable de una celda: número, texto en minúsculas o null si está vacía. */
function comparable(t: Tabla, col: Columna, filaId: string, calc: Calculadora): number | string | null {
    if (col.tipo.v === "calculado") {
        const v = calc.calculada(filaId, col.id);
        return v && v.ok ? v.n : null;
    }
    const v: ValorCelda = t.celdas[claveCelda(filaId, col.id)]?.v ?? null;
    if (estaVacio(v)) return null;
    switch (col.tipo.v) {
        case "numero":
            return typeof v === "number" ? v : numeroDesdeTexto(String(v));
        case "fecha":
            return typeof v === "string" ? v : null;
        case "casilla":
            return v === true ? 1 : 0;
        case "seleccion":
            return (nombreDeOpcion(col, v) ?? "").toLowerCase();
        default:
            return String(v).toLowerCase();
    }
}

function textoFiltrable(t: Tabla, col: Columna, filaId: string, calc: Calculadora): string {
    const c = comparable(t, col, filaId, calc);
    return c === null ? "" : String(c);
}

function cumple(t: Tabla, filtro: Filtro, filaId: string, calc: Calculadora): boolean {
    const col = t.columnas[filtro.col];
    if (!col || col.borrada?.v) return true; // un filtro de una columna que ya no existe no oculta nada
    const c = comparable(t, col, filaId, calc);
    const buscado = filtro.valor.trim().toLowerCase();
    switch (filtro.op) {
        case "vacio":
            return c === null || c === "";
        case "no-vacio":
            return !(c === null || c === "");
        case "si":
            return c === 1;
        case "no":
            return c !== 1;
        case "contiene":
            return textoFiltrable(t, col, filaId, calc).includes(buscado);
        case "igual": {
            if (col.tipo.v === "numero" || col.tipo.v === "calculado") {
                const n = numeroDesdeTexto(buscado);
                return n !== null && c === n;
            }
            if (col.tipo.v === "seleccion") return c === normalizarNombre(buscado) || c === buscado;
            return textoFiltrable(t, col, filaId, calc) === buscado;
        }
        case "mayor":
        case "menor": {
            if (c === null) return false;
            if (col.tipo.v === "fecha") return filtro.op === "mayor" ? String(c) > buscado : String(c) < buscado;
            const n = numeroDesdeTexto(buscado);
            if (n === null || typeof c !== "number") return false;
            return filtro.op === "mayor" ? c > n : c < n;
        }
    }
}

const COLACION = (() => {
    try {
        return new Intl.Collator("es", { sensitivity: "base", numeric: true });
    } catch {
        return null;
    }
})();

function compararValores(a: number | string, b: number | string): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    const sa = String(a);
    const sb = String(b);
    return COLACION ? COLACION.compare(sa, sb) : sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Los ids de fila que ve esta persona, en su orden: aplica filtros y orden sobre el orden
 * compartido (el orden es estable: a igualdad conserva el orden de la tabla; los vacíos van al final).
 */
export function aplicarVista(t: Tabla, vista: VistaTabla, calc: Calculadora = crearCalculadora(t)): string[] {
    let ids = filasVisibles(t).map((f) => f.id);
    for (const f of vista.filtros) ids = ids.filter((id) => cumple(t, f, id, calc));
    const orden = vista.orden;
    const col = orden ? t.columnas[orden.col] : undefined;
    if (orden && col && !col.borrada?.v) {
        const clave = new Map(ids.map((id) => [id, comparable(t, col, id, calc)]));
        const signo = orden.dir === "asc" ? 1 : -1;
        const pos = new Map(ids.map((id, i) => [id, i]));
        ids = [...ids].sort((x, y) => {
            const a = clave.get(x) ?? null;
            const b = clave.get(y) ?? null;
            if (a === null && b === null) return pos.get(x)! - pos.get(y)!;
            if (a === null) return 1;
            if (b === null) return -1;
            return signo * compararValores(a, b) || pos.get(x)! - pos.get(y)!;
        });
    }
    return ids;
}

/** Quita de la vista lo que apunte a columnas que ya no existen. */
export function limpiarVista(t: Tabla, vista: VistaTabla): VistaTabla {
    const vivas = new Set(columnasVisibles(t).map((c) => c.id));
    const filtros = vista.filtros.filter((f) => vivas.has(f.col));
    const orden = vista.orden && vivas.has(vista.orden.col) ? vista.orden : null;
    if (filtros.length === vista.filtros.length && orden === vista.orden) return vista;
    return { orden, filtros };
}

// ───────────────────────────── memoria local ─────────────────────────────

const PREFIJO = "starseed.tabla.vista.";

export function leerVista(espacioId: string): VistaTabla {
    try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIJO + espacioId);
        if (!raw) return VISTA_VACIA;
        const p = JSON.parse(raw) as Partial<VistaTabla>;
        const filtros = Array.isArray(p.filtros)
            ? p.filtros.filter((f): f is Filtro => !!f && typeof f.col === "string" && typeof f.op === "string" && typeof f.valor === "string").slice(0, 12)
            : [];
        const o = p.orden;
        const orden = o && typeof o.col === "string" && (o.dir === "asc" || o.dir === "desc") ? { col: o.col, dir: o.dir } : null;
        return orden || filtros.length ? { orden, filtros } : VISTA_VACIA;
    } catch {
        return VISTA_VACIA;
    }
}

export function guardarVista(espacioId: string, vista: VistaTabla): void {
    try {
        if (typeof localStorage === "undefined") return;
        if (vistaVacia(vista)) localStorage.removeItem(PREFIJO + espacioId);
        else localStorage.setItem(PREFIJO + espacioId, JSON.stringify(vista));
    } catch {
        /* sin almacenamiento: la vista vive solo en memoria */
    }
}
