/**
 * Escena 3D compartida · FUSIÓN (L5 · 2026-09-28).
 * ============================================================================
 * Mapa LWW por objeto con lápidas, con las MISMAS reglas de desempate que las salas
 * (`@/lib/salas/sincronia-sala`), para que todas las neuronas lleguen al mismo resultado
 * fusionen en el orden que fusionen:
 *
 *   1. gana `actualizado` mayor;
 *   2. si empatan, gana el `por` menor alfabéticamente;
 *   3. si aun así empatan, gana la LÁPIDA;
 *   4. y si todo empata (mismo dispositivo, mismo milisegundo, dos contenidos), gana el contenido
 *      cuyo JSON es mayor — un orden total, para que la fusión sea conmutativa SIEMPRE.
 *
 * Propiedades que prueban los tests: conmutativa, asociativa, idempotente. Y estable en
 * referencias: si lo que llega no cambia nada, se devuelve EXACTAMENTE el mismo objeto `doc`
 * (así el snapshot de `useSyncExternalStore` no cambia y React no re-renderiza en bucle).
 *
 * Módulo PURO.
 */

import type { AmbienteEscena, DocEscena, ObjetoEscena } from "./modelo";
import { lapida } from "./modelo";

function comparar(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** ¿Gana `a` sobre `b`? (orden total y determinista). */
export function ganaObjeto(a: ObjetoEscena, b: ObjetoEscena): boolean {
    if (a.actualizado !== b.actualizado) return a.actualizado > b.actualizado;
    if (a.por !== b.por) return a.por < b.por;
    const la = Boolean(a.borrado);
    const lb = Boolean(b.borrado);
    if (la !== lb) return la;
    return comparar(JSON.stringify(a), JSON.stringify(b)) > 0;
}

/** ¿Son la misma versión (misma marca, autor, estado y contenido)? */
export function mismaVersion(a: ObjetoEscena, b: ObjetoEscena): boolean {
    if (a === b) return true;
    if (a.actualizado !== b.actualizado || a.por !== b.por || Boolean(a.borrado) !== Boolean(b.borrado)) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

export function ganaAmbiente(a: AmbienteEscena, b: AmbienteEscena): boolean {
    if (a.actualizado !== b.actualizado) return a.actualizado > b.actualizado;
    if (a.por !== b.por) return a.por < b.por;
    return comparar(JSON.stringify(a), JSON.stringify(b)) > 0;
}

function mismoAmbiente(a: AmbienteEscena, b: AmbienteEscena): boolean {
    return a === b || (a.actualizado === b.actualizado && a.por === b.por && a.cielo === b.cielo && a.suelo === b.suelo);
}

/**
 * Aplica versiones entrantes de objetos sobre un doc. Devuelve el MISMO `doc` si nada gana.
 * `cambiados` lista los ids que cambiaron de verdad (para saber qué re-emitir o persistir).
 */
export function aplicarObjetos(
    doc: DocEscena,
    entrantes: Iterable<ObjetoEscena>,
): { doc: DocEscena; cambiados: string[] } {
    let objetos: Record<string, ObjetoEscena> | null = null;
    const cambiados: string[] = [];
    for (const e of entrantes) {
        const actual = (objetos ?? doc.objetos)[e.id];
        if (actual && (mismaVersion(actual, e) || ganaObjeto(actual, e))) continue;
        if (!objetos) objetos = { ...doc.objetos };
        objetos[e.id] = e;
        cambiados.push(e.id);
    }
    if (!objetos) return { doc, cambiados };
    return { doc: { ...doc, objetos }, cambiados };
}

export function aplicarAmbiente(doc: DocEscena, entrante: AmbienteEscena): DocEscena {
    if (mismoAmbiente(doc.ambiente, entrante) || ganaAmbiente(doc.ambiente, entrante)) return doc;
    return { ...doc, ambiente: entrante };
}

/**
 * Fusiona dos docs de la misma escena. Devuelve `a` tal cual si `b` no aporta nada nuevo
 * (estabilidad de referencias).
 */
export function fusionarDocs(a: DocEscena, b: DocEscena): DocEscena {
    const conObjetos = aplicarObjetos(a, Object.values(b.objetos)).doc;
    return aplicarAmbiente(conObjetos, b.ambiente);
}

/** Mayor marca vista en un doc (alimenta el reloj híbrido). */
export function marcaMaxima(doc: DocEscena): number {
    let m = doc.ambiente.actualizado;
    for (const o of Object.values(doc.objetos)) if (o.actualizado > m) m = o.actualizado;
    return m;
}

/**
 * Lo que `local` tiene y `base` no (o tiene más nuevo): los cambios propios pendientes de
 * guardar respecto al servidor.
 */
export function diferenciaSobre(local: DocEscena, base: DocEscena): { objetos: ObjetoEscena[]; ambiente: AmbienteEscena | null } {
    const objetos: ObjetoEscena[] = [];
    for (const o of Object.values(local.objetos)) {
        const b = base.objetos[o.id];
        if (!b || (!mismaVersion(o, b) && ganaObjeto(o, b))) objetos.push(o);
    }
    const ambiente = !mismoAmbiente(local.ambiente, base.ambiente) && ganaAmbiente(local.ambiente, base.ambiente) ? local.ambiente : null;
    return { objetos, ambiente };
}

/**
 * Poda de lápidas muy viejas (por defecto, 30 días): quien vuelva tras más tiempo sin conectar
 * con ese objeto aún vivo lo resucitaría — es el precio de no crecer para siempre, y se asume.
 */
export function podarLapidas(doc: DocEscena, ahora: number, edadMaxMs = 30 * 24 * 3600 * 1000): DocEscena {
    let objetos: Record<string, ObjetoEscena> | null = null;
    for (const [id, o] of Object.entries(doc.objetos)) {
        if (o.borrado && ahora - o.actualizado > edadMaxMs) {
            if (!objetos) objetos = { ...doc.objetos };
            delete objetos[id];
        }
    }
    return objetos ? { ...doc, objetos } : doc;
}

/** Lápida para un objeto (respeta su tipo para que la fusión sea limpia). */
export function lapidaDe(o: ObjetoEscena, actualizado: number, por: string): ObjetoEscena {
    return lapida(o.id, o.tipo, actualizado, por);
}
