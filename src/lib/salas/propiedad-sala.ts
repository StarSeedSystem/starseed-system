/*
 * ══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Propiedad de sala (Ola 1025R) — Reglas de "actor por épocas".
 * ---------------------------------------------------------------------------
 * Cada elemento de sala tiene un dueño y una época. La regla co-op-anything:
 * uno escribe a la vez. Ceder eleva la época. Escritura vieja se rechaza.
 * Módulo PURO: sin red, sin disco, sin `node:*`. Sólo decide y explica.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { puedeEditar, rolDe } from "@/lib/salas/sala";

/** Dueño y época de un elemento de sala. */
export interface Propiedad {
    dueno: string;
    epoca: number;
}

/** Mapa de propiedad por id de elemento de sala. */
export type Propiedades = Record<string, Propiedad>;

/** ¿El elemento en el mapa tiene dueño vacío o ausente? */
function sinDueno(p: Propiedades, id: string): boolean {
    const prop = p[id];
    return prop === undefined || prop.dueno === "";
}

/** Reclamar: un elemento sin dueño pasa a `quien` con época 1. */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
    const nuevo = { ...p };
    if (sinDueno(p, id)) {
        nuevo[id] = { dueno: quien, epoca: 1 };
    }
    return nuevo;
}

/** Traspasar: solo si `de` es el dueño; sube la época en 1. */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
    const nuevo = { ...p };
    const prop = nuevo[id];
    if (prop && prop.dueno === de) {
        nuevo[id] = { dueno: a, epoca: prop.epoca + 1 };
    }
    return nuevo;
}

/** Aceptar escritura: ¿el elemento permite escritura? */
export function aceptarEscritura(
    p: Propiedades,
    id: string,
    quien: string,
    epocaVista: number,
): {
    ok: true;
} | {
    ok: false;
    motivo: "sin-dueno" | "no-es-dueno" | "epoca-vieja";
} {
    const prop = p[id];
    if (!prop) {
        return { ok: false, motivo: "sin-dueno" };
    }
    if (prop.dueno !== quien) {
        return { ok: false, motivo: "no-es-dueno" };
    }
    if (prop.epoca < epocaVista) {
        return { ok: false, motivo: "epoca-vieja" };
    }
    return { ok: true };
}

/** Explicar el motivo de fallo de escritura en español, sin tecnicismos. */
export function explicar(
    motivo: "sin-dueno" | "no-es-dueno" | "epoca-vieja",
    nombreDueno?: string,
): string {
    switch (motivo) {
        case "sin-dueno":
            return nombreDueno
                ? `esa pieza la tiene ${nombreDueno}; pídesela`
                : "esa pieza no tiene dueño aún; nadie puede escribirla";
        case "no-es-dueno":
            return nombreDueno
                ? `solo ${nombreDueno} puede escribir esa pieza; pídesela o traspásela`
                : "solo el dueño puede escribir esa pieza; pídesela o traspásela";
        case "epoca-vieja":
            return "la época que vio es antigua; alguien más escribió desde entonces; pida la escritura actual";
        default:
            return "motivo desconocido";
    }
}

/** Fusionar dos mapas de propiedades: determina quién gana.
 * Determinista y conmutativa: gana la época mayor; a igual época,
 * gana el dueño menor alfabéticamente. Devuelve la lista de conflictos.
 */
export function fusionarPropiedades(
    a: Propiedades,
    b: Propiedades,
): [Propiedades, string[]] {
    const resultado: Propiedades = { ...a };
    const conflictos: string[] = [];

    const claves = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

    for (const id of claves) {
        const ea = a[id];
        const eb = b[id];

        if (!ea && !eb) continue;

        if (!ea) {
            resultado[id] = { dueno: eb.dueno, epoca: eb.epoca };
        } else if (!eb) {
            resultado[id] = { dueno: ea.dueno, epoca: ea.epoca };
        } else if (ea.epoca > eb.epoca) {
            // a gana por época mayor: nada que hacer, ya está en resultado
        } else if (eb.epoca > ea.epoca) {
            // b gana por época mayor
            resultado[id] = { dueno: eb.dueno, epoca: eb.epoca };
            conflictos.push(id);
        } else {
            // épocas iguales: gana el dueño menor alfabéticamente
            if (ea.dueno < eb.dueno) {
                // a gana: nada que hacer
            } else if (eb.dueno < ea.dueno) {
                // b gana
                resultado[id] = { dueno: eb.dueno, epoca: eb.epoca };
                conflictos.push(id);
            } else {
                // mismo dueño y misma época: sin conflicto, mantener la de a
            }
        }
    }

    return [resultado, conflictos];
}

/** ¿Puede escribir en este elemento de esta sala?
 * Combina el rol `puedeEditar` con la propiedad del elemento.
 * Un editor escribe lo suyo o lo que nadie reclamó.
 * `forzarTraspaso` solo lo puede el dueño de la sala.
 */
export function puedeEscribir(
    sala: import("@/lib/salas/sala").Sala,
    usuarioId: string,
    p: Propiedades,
    id: string,
): {
    ok: true;
    dueno?: string;
} | {
    ok: false;
    motivo: string;
} {
    const rol = rolDe(sala, usuarioId);
    const prop = p[id];

    // Si el elemento no tiene propiedad aún, solo dueño/editor pueden reclamar/escribir
    if (!prop) {
        if (rol === "dueno" || rol === "editor") {
            return { ok: true, dueno: undefined };
        }
        return {
            ok: false,
            motivo: "solo dueños y editores pueden reclamar/escribir elementos nuevos",
        };
    }

    // Dueño y editor pueden escribir, con restricciones de propiedad
    if (rol === "dueno") {
        // El dueño de la sala puede escribir cualquier elemento
        return { ok: true, dueno: prop.dueno };
    }

    if (rol === "editor") {
        if (prop.dueno === undefined || prop.dueno === "") {
            // Nadie lo reclamó: el editor puede escribir
            return { ok: true, dueno: undefined };
        }
        if (prop.dueno === usuarioId) {
            // Es del propio editor: puede escribir
            return { ok: true, dueno: prop.dueno };
        }
        // Editor intentando escribir ajeno: no puede
        return {
            ok: false,
            motivo: "solo el dueño de ese elemento puede escribirlo; pida un traspaso",
        };
    }

    // Comentarista u observador: no pueden escribir
    return {
        ok: false,
        motivo: "solo dueños y editores pueden escribir en elementos de la sala",
    };
}

/** Forzar traspaso: solo el dueño de la sala puede ceder un elemento.
 * Devuelve el nuevo mapa de propiedad y un registro de quién lo forzó
 * y a quién se lo dio.
 */
export function forzarTraspaso(
    sala: import("@/lib/salas/sala").Sala,
    usuarioId: string,
    p: Propiedades,
    id: string,
    a: string,
): [Propiedades, { de: string; a: string }] {
    const dueñoSala = Object.entries(sala.miembros).find(
        ([, rol]) => rol === "dueno",
    );

    if (!dueñoSala || dueñoSala[0] !== usuarioId) {
        return [p, { de: "", a: "" }];
    }

    const nuevo = traspasar(p, id, dueñoSala[0], a);
    return [nuevo, { de: dueñoSala[0], a }];
}