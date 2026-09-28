/**
 * Deshacer / rehacer COLABORATIVO (2026-09-28).
 *
 * Cada acción local guarda el par `{ antes, despues }` (las tablas justo antes y después). Deshacer
 * no restaura una foto vieja —eso borraría el trabajo de los demás—: recorre solo los registros
 * que ESA acción cambió y, para cada uno, escribe de vuelta su valor anterior con un reloj nuevo…
 * SIEMPRE QUE nadie lo haya tocado después. Lo que otra persona editó entretanto se respeta.
 *
 * Rehacer es lo mismo al revés: se registra el par de la propia deshacción y se invierte.
 */
import { mismoReg } from "./fusion";
import { reg, type Ctx, type Reg, type Tabla } from "./modelo";

export interface Paso {
    antes: Tabla;
    despues: Tabla;
}

export const MAX_HISTORIAL = 60;

type Ruta = string;

/** Todos los registros de la tabla, por ruta estable. */
function registros(t: Tabla): Map<Ruta, Reg<unknown>> {
    const m = new Map<Ruta, Reg<unknown>>();
    for (const [k, r] of Object.entries(t.celdas)) m.set(`c|${k}`, r);
    for (const f of Object.values(t.filas)) {
        m.set(`f|${f.id}|orden`, f.orden);
        if (f.borrada) m.set(`f|${f.id}|borrada`, f.borrada);
    }
    for (const c of Object.values(t.columnas)) {
        m.set(`k|${c.id}|nombre`, c.nombre);
        m.set(`k|${c.id}|tipo`, c.tipo);
        m.set(`k|${c.id}|ancho`, c.ancho);
        m.set(`k|${c.id}|orden`, c.orden);
        if (c.formula) m.set(`k|${c.id}|formula`, c.formula);
        if (c.total) m.set(`k|${c.id}|total`, c.total);
        if (c.borrada) m.set(`k|${c.id}|borrada`, c.borrada);
        for (const [oid, o] of Object.entries(c.opciones ?? {})) m.set(`o|${c.id}|${oid}`, o);
    }
    return m;
}

function escribir(t: Tabla, ruta: Ruta, r: Reg<unknown>): Tabla {
    const partes = ruta.split("|");
    if (partes[0] === "c") {
        const clave = `${partes[1]}|${partes[2]}`;
        return { ...t, celdas: { ...t.celdas, [clave]: r as Tabla["celdas"][string] } };
    }
    if (partes[0] === "f") {
        const f = t.filas[partes[1]];
        if (!f) return t;
        const nueva = partes[2] === "orden" ? { ...f, orden: r as Reg<number> } : { ...f, borrada: r as Reg<boolean> };
        return { ...t, filas: { ...t.filas, [f.id]: nueva } };
    }
    const c = t.columnas[partes[1]];
    if (!c) return t;
    let nueva = c;
    if (partes[0] === "o") {
        nueva = { ...c, opciones: { ...(c.opciones ?? {}), [partes[2]]: r as Reg<never> } };
    } else {
        const campo = partes[2] as "nombre" | "tipo" | "ancho" | "orden" | "formula" | "total" | "borrada";
        nueva = { ...c, [campo]: r } as typeof c;
    }
    return { ...t, columnas: { ...t.columnas, [c.id]: nueva } };
}

/** Qué valor recupera un registro que no existía antes de la acción. */
function valorNeutro(ruta: Ruta): { hay: boolean; v?: unknown } {
    if (ruta.startsWith("c|")) return { hay: true, v: null };
    if (ruta.endsWith("|borrada")) return { hay: true, v: false };
    if (ruta.startsWith("o|")) return { hay: true, v: null };
    return { hay: false };
}

/**
 * Deshace lo que hizo el paso `{antes, despues}` sobre `actual`, respetando los cambios ajenos
 * posteriores. Devuelve `actual` si no había nada que revertir.
 */
export function invertirPaso(paso: Paso, actual: Tabla, c: Ctx): Tabla {
    const ra = registros(paso.antes);
    const rd = registros(paso.despues);
    const rc = registros(actual);
    let t = actual;

    // Filas/columnas CREADAS por la acción → se entierran (lápida).
    for (const id of Object.keys(paso.despues.filas)) {
        if (paso.antes.filas[id]) continue;
        const f = t.filas[id];
        if (f && !f.borrada?.v) t = { ...t, filas: { ...t.filas, [id]: { ...f, borrada: reg(true, c) } } };
    }
    for (const id of Object.keys(paso.despues.columnas)) {
        if (paso.antes.columnas[id]) continue;
        const col = t.columnas[id];
        if (col && !col.borrada?.v) t = { ...t, columnas: { ...t.columnas, [id]: { ...col, borrada: reg(true, c) } } };
    }

    for (const [ruta, despues] of rd) {
        const antes = ra.get(ruta);
        if (antes && mismoReg(antes, despues)) continue; // la acción no lo tocó
        const ahora = rc.get(ruta);
        if (!ahora || !mismoReg(ahora, despues)) continue; // otra persona lo cambió después
        let previo: unknown;
        if (antes) previo = antes.v;
        else {
            const n = valorNeutro(ruta);
            if (!n.hay) continue;
            previo = n.v;
        }
        t = escribir(t, ruta, reg(previo, c));
    }
    return t;
}

/** Pila de deshacer/rehacer de UNA sesión de edición (no se comparte). */
export interface PilasHistorial {
    deshacer: Paso[];
    rehacer: Paso[];
}

export function pilasVacias(): PilasHistorial {
    return { deshacer: [], rehacer: [] };
}

export function registrarPaso(p: PilasHistorial, paso: Paso): PilasHistorial {
    if (paso.antes === paso.despues) return p;
    const deshacer = [...p.deshacer, paso].slice(-MAX_HISTORIAL);
    return { deshacer, rehacer: [] };
}
