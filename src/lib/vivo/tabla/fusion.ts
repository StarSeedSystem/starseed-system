/**
 * Fusión de tablas a nivel de CELDA (2026-09-28).
 *
 * `fusionarTablas(a, b)` combina dos versiones de la misma tabla registro a registro. Es
 * conmutativa, asociativa e idempotente (un CRDT de registros con reloj), así que da igual en qué
 * orden lleguen los cambios o cuántas veces: todas las copias convergen.
 *
 * Reglas de desempate de un registro: gana el `t` mayor; a igualdad, el autor mayor; a igualdad de
 * ambos, el valor con la representación JSON mayor (un orden total, siempre el mismo en todas las
 * copias).
 *
 * Comparte estructura: si `b` no aporta nada, devuelve LA MISMA referencia `a`. Eso permite saber
 * en O(n) si una versión "tiene algo que la otra no" (`fusionarTablas(x, y) !== x`) y mantener
 * estables los snapshots de React.
 */
import type { Columna, Fila, OpcionDato, Reg, Tabla } from "./modelo";
import { FORMATO_TABLA } from "./modelo";

function clave(v: unknown): string {
    try {
        return JSON.stringify(v) ?? "";
    } catch {
        return "";
    }
}

/** ¿Debe ganar `cand` sobre `actual`? Orden total y determinista. */
export function ganaReg(cand: Reg<unknown>, actual: Reg<unknown>): boolean {
    if (cand.t !== actual.t) return cand.t > actual.t;
    if (cand.a !== actual.a) return cand.a > actual.a;
    return clave(cand.v) > clave(actual.v);
}

export function mismoReg(a: Reg<unknown> | undefined, b: Reg<unknown> | undefined): boolean {
    if (!a || !b) return a === b;
    return a.t === b.t && a.a === b.a && clave(a.v) === clave(b.v);
}

/** Devuelve `a` salvo que `b` gane. */
function fusionarReg<T>(a: Reg<T> | undefined, b: Reg<T> | undefined): Reg<T> | undefined {
    if (!b) return a;
    if (!a) return b;
    return ganaReg(b, a) ? b : a;
}

function fusionarMapaReg<T>(
    a: Record<string, Reg<T>> | undefined,
    b: Record<string, Reg<T>> | undefined,
): Record<string, Reg<T>> | undefined {
    if (!b) return a;
    let out = a;
    for (const k of Object.keys(b)) {
        const rb = b[k];
        const ra = out?.[k];
        if (!ra || ganaReg(rb, ra)) {
            if (out === a) out = { ...(a ?? {}) };
            out![k] = rb;
        }
    }
    return out;
}

function fusionarColumna(a: Columna, b: Columna): Columna {
    const nombre = fusionarReg(a.nombre, b.nombre)!;
    const tipo = fusionarReg(a.tipo, b.tipo)!;
    const ancho = fusionarReg(a.ancho, b.ancho)!;
    const orden = fusionarReg(a.orden, b.orden)!;
    const formula = fusionarReg(a.formula, b.formula);
    const total = fusionarReg(a.total, b.total);
    const borrada = fusionarReg(a.borrada, b.borrada);
    const opciones = fusionarMapaReg<OpcionDato | null>(a.opciones, b.opciones);
    if (
        nombre === a.nombre && tipo === a.tipo && ancho === a.ancho && orden === a.orden &&
        formula === a.formula && total === a.total && borrada === a.borrada && opciones === a.opciones
    ) {
        return a;
    }
    const out: Columna = { id: a.id, nombre, tipo, ancho, orden };
    if (opciones) out.opciones = opciones;
    if (formula) out.formula = formula;
    if (total) out.total = total;
    if (borrada) out.borrada = borrada;
    return out;
}

function fusionarFila(a: Fila, b: Fila): Fila {
    const orden = fusionarReg(a.orden, b.orden)!;
    const borrada = fusionarReg(a.borrada, b.borrada);
    if (orden === a.orden && borrada === a.borrada) return a;
    const out: Fila = { id: a.id, orden };
    if (borrada) out.borrada = borrada;
    return out;
}

/** Fusiona `b` en `a`. Devuelve `a` (misma referencia) si `b` no añade nada. */
export function fusionarTablas(a: Tabla, b: Tabla): Tabla {
    if (a === b) return a;

    let columnas = a.columnas;
    for (const id of Object.keys(b.columnas)) {
        const cb = b.columnas[id];
        const ca = columnas[id];
        const fusion = ca ? fusionarColumna(ca, cb) : cb;
        if (fusion !== ca) {
            if (columnas === a.columnas) columnas = { ...a.columnas };
            columnas[id] = fusion;
        }
    }

    let filas = a.filas;
    for (const id of Object.keys(b.filas)) {
        const fb = b.filas[id];
        const fa = filas[id];
        const fusion = fa ? fusionarFila(fa, fb) : fb;
        if (fusion !== fa) {
            if (filas === a.filas) filas = { ...a.filas };
            filas[id] = fusion;
        }
    }

    let celdas = a.celdas;
    for (const k of Object.keys(b.celdas)) {
        const cb = b.celdas[k];
        const ca = celdas[k];
        if (!ca || ganaReg(cb, ca)) {
            if (celdas === a.celdas) celdas = { ...a.celdas };
            celdas[k] = cb;
        }
    }

    if (columnas === a.columnas && filas === a.filas && celdas === a.celdas) return a;
    return { v: FORMATO_TABLA, columnas, filas, celdas };
}

/** ¿Las dos tablas dicen lo mismo? (ninguna aporta nada a la otra). */
export function tablasIguales(a: Tabla, b: Tabla): boolean {
    return a === b || (fusionarTablas(a, b) === a && fusionarTablas(b, a) === b);
}

export interface OpcionesPoda {
    /** Las celdas de filas/columnas borradas hace más de esto se sueltan. Por defecto 7 días. */
    celdasMs?: number;
    /** Las lápidas más viejas que esto se sueltan. Por defecto 60 días. */
    lapidasMs?: number;
}

const DIA = 86_400_000;

/**
 * Limpia lo que ya no sirve: celdas de filas/columnas borradas hace tiempo y, mucho después, las
 * propias lápidas. Ojo: quitar una lápida permite que una copia MUY vieja la resucite; por eso el
 * plazo por defecto es largo (60 días). Devuelve la misma referencia si no hay nada que podar.
 */
export function podar(t: Tabla, ahora: number, opc: OpcionesPoda = {}): Tabla {
    const celdasMs = opc.celdasMs ?? 7 * DIA;
    const lapidasMs = opc.lapidasMs ?? 60 * DIA;
    const filasMuertas = new Set<string>();
    const colsMuertas = new Set<string>();
    for (const f of Object.values(t.filas)) if (f.borrada?.v && ahora - f.borrada.t > celdasMs) filasMuertas.add(f.id);
    for (const c of Object.values(t.columnas)) if (c.borrada?.v && ahora - c.borrada.t > celdasMs) colsMuertas.add(c.id);
    if (!filasMuertas.size && !colsMuertas.size) return t;

    const celdas: Tabla["celdas"] = {};
    let quitadas = 0;
    for (const [k, c] of Object.entries(t.celdas)) {
        const i = k.indexOf("|");
        if (filasMuertas.has(k.slice(0, i)) || colsMuertas.has(k.slice(i + 1))) {
            quitadas += 1;
            continue;
        }
        celdas[k] = c;
    }

    const filas: Tabla["filas"] = {};
    const columnas: Tabla["columnas"] = {};
    let lapidas = 0;
    for (const [id, f] of Object.entries(t.filas)) {
        if (filasMuertas.has(id) && ahora - f.borrada!.t > lapidasMs) {
            lapidas += 1;
            continue;
        }
        filas[id] = f;
    }
    for (const [id, c] of Object.entries(t.columnas)) {
        if (colsMuertas.has(id) && ahora - c.borrada!.t > lapidasMs) {
            lapidas += 1;
            continue;
        }
        columnas[id] = c;
    }
    if (!quitadas && !lapidas) return t;
    return { v: FORMATO_TABLA, columnas, filas, celdas };
}
