/**
 * IMA11 · Almacén local de paquetes de idioma instalados (por neurona).
 * Módulo PURO: sin red, sin disco, sin procesos. El almacén se inyecta.
 * Clave: `starseed.idiomas.paquetes.v1` en localStorage.
 * Límite: 12 paquetes, 6 MB en total.
 */

import type { PaqueteIdioma } from "./formato";

export const CLAVE_PAQUETES = "starseed.idiomas.paquetes.v1";
export const EVENTO_PAQUETES = "starseed:idiomas-paquetes";

export const LIMITE_PAQUETES = 12;
export const LIMITE_BYTES = 6 * 1024 * 1024;

export interface Almacen {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem?(k: string): void;
}

export interface ResultadoGuardado {
    ok: true;
} & { ok: false; motivo: string };

export function listarPaquetes(a: Almacen): PaqueteIdioma[] {
    try {
        const crudo = a.getItem(CLAVE_PAQUETES);
        if (!crudo) return [];
        const lista = JSON.parse(crudo);
        if (!Array.isArray(lista)) return [];
        const validos: PaqueteIdioma[] = [];
        for (const p of lista) {
            if (esPaqueteValido(p)) {
                validos.push(p as PaqueteIdioma);
            }
        }
        return validos;
    } catch {
        return [];
    }
}

function esPaqueteValido(p: unknown): p is PaqueteIdioma {
    if (typeof p !== "object" || p === null) return false;
    const obj = p as Record<string, unknown>;
    if (obj.formato !== "starseed-idioma") return false;
    if (typeof obj.version !== "number") return false;
    if (typeof obj.codigo !== "string") return false;
    if (typeof obj.nombre !== "string") return false;
    if (obj.dir !== "ltr" && obj.dir !== "rtl") return false;
    if (typeof obj.autor !== "object" || obj.autor === null) return false;
    if (typeof (obj.autor as Record<string, unknown>).nombre !== "string") return false;
    if (typeof obj.entradas !== "object" || obj.entradas === null) return false;
    for (const v of Object.values(obj.entradas as Record<string, unknown>)) {
        if (typeof v !== "string") return false;
    }
    return true;
}

export function guardarPaquete(paquete: PaqueteIdioma, a: Almacen): ResultadoGuardado {
    const actual = listarPaquetes(a);
    const indice = actual.findIndex((p) => p.codigo === paquete.codigo);
    const nuevos = indice >= 0 ? [...actual.slice(0, indice), paquete, ...actual.slice(indice + 1)] : [...actual, paquete];

    if (nuevos.length > LIMITE_PAQUETES) {
        return { ok: false, motivo: "máximo 12 paquetes" };
    }

    const bytes = JSON.stringify(nuevos).length;
    if (bytes > LIMITE_BYTES) {
        return { ok: false, motivo: "tamaño máximo 6 MB" };
    }

    try {
        a.setItem(CLAVE_PAQUETES, JSON.stringify(nuevos));
        dispararEvento(EVENTO_PAQUETES, a);
        return { ok: true };
    } catch {
        return { ok: false, motivo: "error al guardar" };
    }
}

export function quitarPaquete(codigo: string, a: Almacen): void {
    const actual = listarPaquetes(a);
    const filtrados = actual.filter((p) => p.codigo !== codigo);
    try {
        if (filtrados.length === 0) {
            a.removeItem?.(CLAVE_PAQUETES);
        } else {
            a.setItem(CLAVE_PAQUETES, JSON.stringify(filtrados));
        }
        dispararEvento(EVENTO_PAQUETES, a);
    } catch {
        // Silencioso: no romper si falla
    }
}

export function leerPaquete(codigo: string, a: Almacen): PaqueteIdioma | null {
    const paquetes = listarPaquetes(a);
    return paquetes.find((p) => p.codigo === codigo) ?? null;
}

export function dispararEvento(tipo: string, _a?: Almacen): void {
    try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent(tipo, { detail: { codigo: null } }));
        }
    } catch {
        // Silencioso: no romper si falla
    }
}