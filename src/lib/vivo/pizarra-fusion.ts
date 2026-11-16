/**
 * Fusión de pizarras por REGISTRO (SES1116, 2026-11-16).
 *
 * `fusionarPizarras(a, b)` combina dos versiones de la misma pizarra. Por cada id gana el registro
 * de `t` mayor; en empate gana la LÁPIDA y, si no, el autor MENOR por orden alfabético (así dos
 * editores que se cruzan convergen al mismo resultado). Es un máximo sobre un orden total, luego
 * conmutativa, asociativa e idempotente: da igual el orden de llegada o cuántas veces se fusione.
 *
 * Comparte estructura: si `b` no aporta nada devuelve LA MISMA referencia `a`.
 */
import { FORMATO_PIZARRA, type DocPizarra, type RegistroBase } from "./pizarra";

function clave(v: unknown): string {
    try {
        return JSON.stringify(v) ?? "";
    } catch {
        return "";
    }
}

/** Orden total y determinista entre dos registros del mismo id. */
export function ganaRegistroPizarra<T>(cand: RegistroBase<T>, actual: RegistroBase<T>): boolean {
    if (cand.t !== actual.t) return cand.t > actual.t;
    const candX = cand.x === true;
    const actualX = actual.x === true;
    if (candX !== actualX) return candX;
    if (cand.a !== actual.a) return cand.a < actual.a;
    return clave(cand.v) < clave(actual.v);
}

function fusionarMapa<T>(
    a: Record<string, RegistroBase<T>>,
    b: Record<string, RegistroBase<T>>,
): Record<string, RegistroBase<T>> {
    let salida = a;
    for (const id of Object.keys(b)) {
        const rb = b[id];
        const ra = salida[id];
        if (!ra || ganaRegistroPizarra(rb, ra)) {
            if (salida === a) salida = { ...a };
            salida[id] = rb;
        }
    }
    return salida;
}

/** Fusiona `b` en `a`. Devuelve `a` (misma referencia) si `b` no aporta nada. */
export function fusionarPizarras(a: DocPizarra, b: DocPizarra): DocPizarra {
    if (a === b) return a;
    const bloques = fusionarMapa(a.bloques, b.bloques);
    const aristas = fusionarMapa(a.aristas, b.aristas);
    if (bloques === a.bloques && aristas === a.aristas) return a;
    return { formato: FORMATO_PIZARRA, bloques, aristas };
}

/** ¿Las dos pizarras dicen lo mismo? (ninguna aporta nada a la otra). */
export function pizarrasIguales(a: DocPizarra, b: DocPizarra): boolean {
    return a === b || (fusionarPizarras(a, b) === a && fusionarPizarras(b, a) === b);
}
