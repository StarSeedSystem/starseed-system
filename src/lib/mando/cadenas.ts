/**
 * Cadenas de reintento y dependencias: la MISMA regla que el orquestador. PURA (va al navegador).
 *
 * (2026-10-08) Alex: «los directores no revisan bien los medidores ni lo que realmente está
 * pasando». Medido a las 17:00: «Listas para trabajar» decía «RM7 · se puede coger ya» mientras
 * el orquestador y el vigilante la tenían BLOQUEADA, porque RM7 espera a RM6 y RM6 estaba
 * «sustituida» (su objeción la rehace RM6b, que aún no se ha integrado). Genesis daba por hecha
 * cualquier dependencia «sustituida», «reasignada» o «sin_cambios»; el orquestador
 * (`dependencias_ok`) solo da por buena una dependencia INTEGRADA, y el vigilante
 * (`sucesora_integrada`) acepta además que la haya integrado una sucesora de su cadena. Dos
 * reglas distintas son dos verdades distintas: «Buscar más capacidad» veía 0 listas y el medidor
 * 1, y nadie entendía por qué no arrancaba nada. Aquí vive la única.
 *
 * Una cadena es una tarea y sus reintentos: «RM6» → «RM6b» → «RM6c» (una minúscula b-z al final,
 * detrás de mayúscula o cifra, como `obtenerBaseId` de Genesis y `base_de_cadena` del vigilante).
 */

/** Estados en los que una tarea YA está en main. */
export const INTEGRADOS = new Set(["commit", "hecho"]);

/** Estados de los que una tarea ya no sale sola (nadie la va a seguir escribiendo). */
export const MUERTOS = new Set(["rechazada", "bloqueante", "descartada", "sustituida", "cancelada"]);

/** «CAMR1005Db» → «CAMR1005D»; «RM6» → «RM6». */
export function baseDeCadena(id: string): string {
    return /[A-Z0-9][b-z]$/.test(id) ? id.slice(0, -1) : id;
}

/** Posición en su cadena: 0 la original, 1 la «b», 2 la «c»… */
export function ordenEnCadena(id: string): number {
    return id === baseDeCadena(id) ? 0 : id.charCodeAt(id.length - 1) - 97;
}

/** Las sucesoras de `id` (misma cadena, letra posterior), de la más vieja a la más nueva. */
export function sucesorasDe(id: string, ids: Iterable<string>): string[] {
    const base = baseDeCadena(id);
    const propio = ordenEnCadena(id);
    return [...new Set(ids)]
        .filter((k) => k !== id && baseDeCadena(k) === base && ordenEnCadena(k) > propio)
        .sort((a, b) => ordenEnCadena(a) - ordenEnCadena(b));
}

export interface EstadoDeDependencia {
    /** El estado que cuenta para quien espera. */
    estado: string;
    /** La sucesora que manda, si el estado es el de ella y no el de la dependencia. */
    via?: string;
    /** ¿Está ya en main (ella o una sucesora)? Solo entonces deja de frenar. */
    cumplida: boolean;
}

/**
 * Lo que de verdad pasa con una dependencia, mirando su cadena entera.
 *
 * - Integrada ella, o integrada una sucesora → cumplida (no frena).
 * - Muerta ella pero con una sucesora viva → espera viva: el estado que cuenta es el de la
 *   sucesora («RM6 sustituida» → «RM6b reasignada»).
 * - Si no, su propio estado (y frena, como en el orquestador).
 */
export function estadoDeDependencia(
    id: string,
    estadoDe: (id: string) => string | undefined,
    ids: Iterable<string>,
    integradaEnMain: (id: string) => boolean = () => false,
): EstadoDeDependencia {
    const propio = estadoDe(id) ?? "";
    if (INTEGRADOS.has(propio) || integradaEnMain(id)) return { estado: propio || "commit", cumplida: true };
    const sucesoras = sucesorasDe(id, ids);
    const integrada = sucesoras.find((k) => INTEGRADOS.has(estadoDe(k) ?? "") || integradaEnMain(k));
    if (integrada) return { estado: "commit", via: integrada, cumplida: true };
    if (MUERTOS.has(propio)) {
        const viva = [...sucesoras].reverse().find((k) => !MUERTOS.has(estadoDe(k) ?? ""));
        if (viva) return { estado: estadoDe(viva) || "pendiente", via: viva, cumplida: false };
    }
    return { estado: propio, cumplida: false };
}
