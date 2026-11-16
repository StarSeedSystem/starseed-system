/**
 * Fusión de pizarras por registro (SVF1A2f). Conmutativa, asociativa e idempotente: da igual en qué orden
 * lleguen los cambios, cuántas veces o repetidos, todas las copias convergen.
 *
 * Orden total de un registro (gana el mayor): 1) `t` mayor; 2) a igual `t`, la lápida; 3) a igual lápida,
 * el autor menor por orden alfabético; 4) como último desempate (mismo `t` y autor, p. ej. un id repetido),
 * el JSON mayor. Por ser un orden TOTAL, fusionar = quedarse con el máximo de cada id, y por eso las tres
 * propiedades se cumplen. Una lápida solo vence a ediciones más viejas (o simultáneas): una edición
 * posterior a la lápida resucita el registro. Si `b` no aporta nada se devuelve `a` (misma referencia).
 */
import { FORMATO_PIZARRA, type DocPizarra } from "./pizarra";

interface Reg {
    v: unknown;
    t: number;
    a: string;
    x?: true;
}

function json(v: unknown): string {
    try {
        return JSON.stringify(v) ?? "";
    } catch {
        return "";
    }
}

/** ¿Debe ganar `c` sobre `a`? Falso si son idénticos. */
export function ganaRegistro(c: Reg, a: Reg): boolean {
    if (c.t !== a.t) return c.t > a.t;
    if (!!c.x !== !!a.x) return !!c.x;
    if (c.a !== a.a) return c.a < a.a;
    return json(c.v) > json(a.v);
}

function fusionarMapa<R extends Reg>(a: Record<string, R>, b: Record<string, R>): Record<string, R> {
    let salida = a;
    for (const id of Object.keys(b)) {
        if (!Object.prototype.hasOwnProperty.call(salida, id) || ganaRegistro(b[id], salida[id])) {
            if (salida === a) salida = { ...a };
            salida[id] = b[id];
        }
    }
    return salida;
}

export function fusionarPizarras(a: DocPizarra, b: DocPizarra): DocPizarra {
    if (a === b) return a;
    const bloques = fusionarMapa(a.bloques, b.bloques);
    const aristas = fusionarMapa(a.aristas, b.aristas);
    return bloques === a.bloques && aristas === a.aristas ? a : { formato: FORMATO_PIZARRA, bloques, aristas };
}
