/**
 * StarSeed OS · Propiedad de elementos por épocas para salas y juegos (Ola 1025R).
 * ============================================================================
 * Co-op Anything llama «propiedad de actor por épocas» a la regla que evita
 * que dos jugadores muevan a la vez lo mismo: cada objeto tiene un dueño y una época;
 * solo el dueño escribe; ceder el objeto sube la época; una escritura con época
 * vieja se rechaza.
 *
 * Módulo PURO y ADITIVO: sin red, sin disco, sin reloj (el reloj o época entra
 * por parámetro o se incrementa de forma determinista).
 */

import { puedeEditar, type Sala } from "@/lib/salas/sala";

export interface Propiedad {
    dueno: string;
    epoca: number;
}

export type Propiedades = Record<string, Propiedad>;

export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

export interface ResultadoEscrituraOk {
    ok: true;
}

export interface ResultadoEscrituraError {
    ok: false;
    motivo: MotivoRechazo;
}

export type ResultadoEscritura = ResultadoEscrituraOk | ResultadoEscrituraError;

/**
 * Explicación en español y sin tecnicismos para cada motivo de rechazo.
 */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
    switch (motivo) {
        case "sin-dueno":
            return "Nadie tiene reclamada esta pieza todavía; reclámala antes de escribir.";
        case "no-es-dueno":
            if (nombreDueno) {
                return `Esa pieza la tiene ${nombreDueno}; pídesela.`;
            }
            return "Esa pieza la tiene otra persona; pídesela.";
        case "epoca-vieja":
            return "Estás intentando escribir con una versión desactualizada; actualiza primero.";
    }
}

/**
 * Reclamar un elemento: un elemento sin dueño pasa a `quien` con época 1.
 * Si ya tiene dueño, no hace nada (devuelve el mapa tal cual o una copia inmutable).
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
    const actual = p[id];
    if (actual && actual.dueno) {
        return p;
    }
    return {
        ...p,
        [id]: { dueno: quien, epoca: 1 },
    };
}

/**
 * Traspasar un elemento: solo si `de` es el dueño actual; sube la época en 1.
 * Si `de` no es el dueño, devuelve el mapa original sin cambios.
 */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
    const actual = p[id];
    if (!actual || actual.dueno !== de) {
        return p;
    }
    return {
        ...p,
        [id]: { dueno: a, epoca: actual.epoca + 1 },
    };
}

/**
 * Aceptar escritura: verifica si `quien` puede escribir en `id` con la `epocaVista`.
 */
export function aceptarEscritura(
    p: Propiedades,
    id: string,
    quien: string,
    epocaVista: number
): ResultadoEscritura {
    const actual = p[id];
    if (!actual || !actual.dueno) {
        return { ok: false, motivo: "sin-dueno" };
    }
    if (actual.dueno !== quien) {
        return { ok: false, motivo: "no-es-dueno" };
    }
    if (epocaVista < actual.epoca) {
        return { ok: false, motivo: "epoca-vieja" };
    }
    return { ok: true };
}

/**
 * Fusionar dos mapas de propiedades de forma determinista y conmutativa.
 * Gana la época mayor y, a igual época y distinto dueño, el dueño menor alfabéticamente.
 * Devuelve además la lista de conflictos detectados.
 */
export interface ResultadoFusion {
    propiedades: Propiedades;
    conflictos: string[];
}

export function fusionarPropiedades(a: Propiedades, b: Propiedades): ResultadoFusion {
    const claves = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})])).sort();
    const resultado: Propiedades = {};
    const conflictos: string[] = [];

    for (const id of claves) {
        const propA = a[id];
        const propB = b[id];

        if (propA && !propB) {
            resultado[id] = { ...propA };
        } else if (!propA && propB) {
            resultado[id] = { ...propB };
        } else if (propA && propB) {
            if (propA.epoca > propB.epoca) {
                resultado[id] = { ...propA };
            } else if (propB.epoca > propA.epoca) {
                resultado[id] = { ...propB };
            } else {
                // Misma época
                if (propA.dueno === propB.dueno) {
                    resultado[id] = { ...propA };
                } else {
                    conflictos.push(id);
                    // Empate de época resuelto deterministamente: dueño menor alfabéticamente
                    const ganadorDueno = propA.dueno < propB.dueno ? propA.dueno : propB.dueno;
                    resultado[id] = {
                        dueno: ganadorDueno,
                        epoca: propA.epoca,
                    };
                }
            }
        }
    }

    return { propiedades: resultado, conflictos };
}

/**
 * Combina el rol (`puedeEditar` de `src/lib/salas/sala.ts`) con la propiedad:
 * un editor escribe lo suyo o lo que nadie reclamó.
 */
export function puedeEscribir(
    sala: Sala,
    usuarioId: string,
    p: Propiedades,
    id: string
): boolean {
    if (!puedeEditar(sala, usuarioId)) {
        return false;
    }
    const prop = p[id];
    // Si no tiene dueño, cualquier editor puede escribir (o reclamarlo)
    if (!prop || !prop.dueno) {
        return true;
    }
    // Si el dueño es el usuario
    if (prop.dueno === usuarioId) {
        return true;
    }
    return false;
}

/**
 * Forzar traspaso: solo lo puede hacer el dueño de la sala.
 * El resultado lleva un registro de quién lo forzó y a quién se lo dio (o se puede modelar actualizando la época y dueño).
 */
export function forzarTraspaso(
    sala: Sala,
    usuarioId: string,
    p: Propiedades,
    id: string,
    a: string
): Propiedades {
    const rolUsuario = sala.miembros[usuarioId];
    if (rolUsuario !== "dueno") {
        return p;
    }
    const actual = p[id];
    const epocaActual = actual ? actual.epoca : 0;
    return {
        ...p,
        [id]: { dueno: a, epoca: epocaActual + 1 },
    };
}
