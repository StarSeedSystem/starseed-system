"use client";

/**
 * CATÁLOGO EDITABLE DE VOCES DEL OS (Ola 228)
 * ─────────────────────────────────────────────────────────────────────────────
 * Las 12 voces predeterminadas viven en `src/lib/aurora/timbres.ts` (TIMBRES).
 * Aquí se construye una vista EDITABLE: el usuario puede ajustar valores,
 * clonar una voz para crear una variante propia y exportar/importar el
 * catálogo entero. Las ediciones se guardan en localStorage
 * (`starseed.voces.v1`) por encima de los valores de código; el código sigue
 * siendo la fuente de verdad para `restablecerVoz`.
 */

import { TIMBRES } from "@/lib/aurora/timbres";

export interface VozEditable {
    id: string;
    nombre: string;
    genero: "femenina" | "masculina" | "neutra";
    desc: string;
    local: { voz: string; speed: number; instruct: string };
    sistema: { pitch: number; rate: number };
    expr: { arco: number; vivacidad: number; calidez: number };
    origen: "defecto" | "editada" | "clon";
    /** Id de la voz base cuando es un clon. */
    base?: string;
    /** Archivo donde vive la definición original. */
    archivoCodigo: string;
    notas?: string;
}

const CLAVE_VOCES = "starseed.voces.v1";
const ARCHIVO = "src/lib/aurora/timbres.ts";

interface Persistencia {
    version: 1;
    voces: VozEditable[];
}

/** Las 12 voces predeterminadas, construidas DESDE TIMBRES (nada copiado a mano). */
export function vocesDefecto(): VozEditable[] {
    return TIMBRES.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        genero: t.genero,
        desc: t.desc,
        local: { voz: t.local.voz, speed: t.local.speed, instruct: t.local.instruct ?? "" },
        sistema: { pitch: t.sistema.pitch, rate: t.sistema.rate },
        expr: { arco: t.expr.arco, vivacidad: t.expr.vivacidad, calidez: t.expr.calidez },
        origen: "defecto",
        archivoCodigo: ARCHIVO,
    }));
}

function leerPersistencia(): VozEditable[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(CLAVE_VOCES);
        if (!raw) return [];
        const datos = JSON.parse(raw) as Partial<Persistencia>;
        return Array.isArray(datos.voces) ? datos.voces : [];
    } catch {
        return [];
    }
}

function escribirPersistencia(voces: VozEditable[]): void {
    if (typeof window === "undefined") return;
    try {
        const datos: Persistencia = { version: 1, voces };
        window.localStorage.setItem(CLAVE_VOCES, JSON.stringify(datos));
    } catch { /* sin almacenamiento */ }
}

/**
 * Catálogo completo: las 12 de TIMBRES, sustituyendo por sus ediciones
 * guardadas, más los clones guardados.
 */
export function cargarVoces(): VozEditable[] {
    const guardadas = leerPersistencia();
    const porId = new Map(guardadas.map((v) => [v.id, v]));
    const base = vocesDefecto().map((v) => porId.get(v.id) ?? v);
    const clones = guardadas.filter((v) => v.origen === "clon" && !vozEsDefecto(v.id, base));
    return [...base, ...clones];
}

function vozEsDefecto(id: string, base: VozEditable[]): boolean {
    return base.some((v) => v.id === id);
}

/** Guarda una voz. Si ya era de las predeterminadas, queda marcada "editada". */
export function guardarVoz(v: VozEditable): void {
    const origen: VozEditable["origen"] = v.origen === "clon" ? "clon" : "editada";
    const lista = leerPersistencia().filter((x) => x.id !== v.id);
    escribirPersistencia([...lista, { ...v, origen }]);
}

/** Clona una voz existente con un id nuevo `clon-<base>-<n>`; no toca la original. */
export function clonarVoz(id: string, nombre: string): VozEditable | null {
    const origen = cargarVoces().find((v) => v.id === id);
    if (!origen) return null;
    const existentes = cargarVoces();
    let n = 1;
    let nuevoId = `clon-${id}-${n}`;
    while (existentes.some((v) => v.id === nuevoId)) {
        n += 1;
        nuevoId = `clon-${id}-${n}`;
    }
    const clon: VozEditable = {
        ...origen,
        id: nuevoId,
        nombre,
        origen: "clon",
        base: id,
    };
    escribirPersistencia([...leerPersistencia(), clon]);
    return clon;
}

/** Quita la edición guardada: la voz vuelve al valor de TIMBRES. */
export function restablecerVoz(id: string): VozEditable | null {
    const original = vocesDefecto().find((v) => v.id === id);
    if (!original) return null;
    escribirPersistencia(leerPersistencia().filter((v) => v.id !== id));
    return original;
}

export function exportarVoces(): string {
    const datos: Persistencia = { version: 1, voces: cargarVoces() };
    return JSON.stringify(datos, null, 2);
}

export function importarVoces(json: string): { ok: boolean; importadas: number; error?: string } {
    try {
        const datos = JSON.parse(json) as Partial<Persistencia>;
        if (!datos || !Array.isArray(datos.voces)) {
            return { ok: false, importadas: 0, error: "El JSON no contiene una lista de voces." };
        }
        const validas = datos.voces.filter((v) => typeof v?.id === "string" && v.id.length > 0);
        escribirPersistencia(validas);
        return { ok: true, importadas: validas.length };
    } catch {
        return { ok: false, importadas: 0, error: "JSON inválido." };
    }
}

/** La voz que realmente suena: edición guardada si existe, si no la del código. */
export function vozEfectiva(id: string): VozEditable | null {
    return cargarVoces().find((v) => v.id === id) ?? null;
}

export function vocesPorGenero(g: VozEditable["genero"]): VozEditable[] {
    return cargarVoces().filter((v) => v.genero === g);
}
