/**
 * VERSIONES DE VOZ (Tarea VZ1 · Ola 240)
 * ─────────────────────────────────────────────────────────────────────────────
 * Una VERSIÓN de voz es una receta completa y congelada: qué timbre base,
 * qué motor/nivel, qué tamaño de modelo OmniVoice y qué parámetros. Se puede
 * probar, comparar, fusionar, valorar y promover sin tocar el catálogo de
 * timbres hasta que la versión esté lista.
 *
 * Persistencia: localStorage, clave `starseed.voces.versiones.v1`.
 * Reglas del área: nunca se lanza una excepción a la interfaz; importar un
 * JSON roto devuelve `{ ok: false, errores }`.
 */

import type { Timbre } from "@/lib/aurora/timbres";
import { buscarTimbre } from "@/lib/aurora/timbres";
import type { NivelVoz } from "@/lib/aurora/voz-starseed/niveles";

export interface VersionVoz {
    id: string;
    nombre: string;
    timbreBase: string;
    motor: NivelVoz;
    tamano: "Q4_K_M" | "Q8_0" | "auto";
    params: {
        voz: string;
        speed: number;
        instruct: string;
        ref?: string;
        expr: { arco: number; vivacidad: number; calidez: number };
    };
    notas: string;
    valoracion: number | null;
    padres: string[];
    creadaEn: string;
    modificadaEn: string;
    promovidaA: string[];
}

const CLAVE = "starseed.voces.versiones.v1";
const MOTORES: NivelVoz[] = ["estudio", "alta", "ligera", "minima"];
const TAMANOS = ["Q4_K_M", "Q8_0", "auto"] as const;

function ahora(): string {
    return new Date().toISOString();
}

function nuevaId(): string {
    return `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function redondear(n: number): number {
    return +n.toFixed(3);
}

/** Crea una versión a partir de un timbre existente, con sus recetas intactas. */
export function versionDesdeTimbre(t: Timbre, nombre?: string): VersionVoz {
    const ts = ahora();
    return {
        id: nuevaId(),
        nombre: nombre ?? `${t.nombre} v1`,
        timbreBase: t.id,
        motor: "alta",
        tamano: "auto",
        params: {
            voz: t.local.voz,
            speed: t.local.speed,
            instruct: t.local.instruct ?? "",
            ...(t.local.ref ? { ref: t.local.ref } : {}),
            expr: { ...t.expr },
        },
        notas: "",
        valoracion: null,
        padres: [],
        creadaEn: ts,
        modificadaEn: ts,
        promovidaA: [],
    };
}

export function cargarVersiones(): VersionVoz[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(CLAVE);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(arr) ? (arr as VersionVoz[]) : [];
    } catch {
        return [];
    }
}

export function guardarVersiones(v: VersionVoz[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE, JSON.stringify(v));
    } catch { /* sin almacenamiento */ }
}

export function crearVersion(v: Omit<VersionVoz, "id" | "creadaEn" | "modificadaEn">): VersionVoz {
    const ts = ahora();
    const nueva: VersionVoz = { ...v, id: nuevaId(), creadaEn: ts, modificadaEn: ts };
    guardarVersiones([...cargarVersiones(), nueva]);
    return nueva;
}

export function actualizarVersion(id: string, cambios: Partial<Omit<VersionVoz, "id" | "creadaEn">>): VersionVoz | null {
    const lista = cargarVersiones();
    const i = lista.findIndex((v) => v.id === id);
    if (i < 0) return null;
    const actualizada: VersionVoz = { ...lista[i], ...cambios, id, modificadaEn: ahora() };
    lista[i] = actualizada;
    guardarVersiones(lista);
    return actualizada;
}

export function borrarVersion(id: string): void {
    guardarVersiones(cargarVersiones().filter((v) => v.id !== id));
}

export function duplicarVersion(id: string, nombre?: string): VersionVoz | null {
    const original = cargarVersiones().find((v) => v.id === id);
    if (!original) return null;
    const ts = ahora();
    const copia: VersionVoz = {
        ...original,
        id: nuevaId(),
        nombre: nombre ?? `${original.nombre} (copia)`,
        params: { ...original.params, expr: { ...original.params.expr } },
        padres: [original.id],
        creadaEn: ts,
        modificadaEn: ts,
        promovidaA: [],
    };
    guardarVersiones([...cargarVersiones(), copia]);
    return copia;
}

/**
 * Fusiona dos versiones en una hija:
 *  · números (speed y expr) interpolados por `peso` (0 = A, 1 = B);
 *  · `instruct` = el de A + « · » + el de B, sin repetir frases;
 *  · `voz` la de la de mayor peso (A en caso de empate).
 */
export function fusionarVersiones(a: VersionVoz, b: VersionVoz, peso = 0.5, nombre?: string): VersionVoz {
    const p = Math.min(1, Math.max(0, peso));
    const interp = (x: number, y: number) => redondear(x + (y - x) * p);

    const frases = (s: string) => s.split("·").map((f) => f.trim()).filter(Boolean);
    const partesA = frases(a.params.instruct);
    const partesB = frases(b.params.instruct).filter(
        (f) => !partesA.some((x) => x.toLowerCase() === f.toLowerCase()),
    );
    const instruct = [...partesA, ...partesB].join(" · ");

    const ts = ahora();
    return {
        id: nuevaId(),
        nombre: nombre ?? `${a.nombre} × ${b.nombre}`,
        timbreBase: p <= 0.5 ? a.timbreBase : b.timbreBase,
        motor: p <= 0.5 ? a.motor : b.motor,
        tamano: p <= 0.5 ? a.tamano : b.tamano,
        params: {
            voz: p <= 0.5 ? a.params.voz : b.params.voz,
            speed: interp(a.params.speed, b.params.speed),
            instruct,
            ...(p <= 0.5
                ? a.params.ref ? { ref: a.params.ref } : {}
                : b.params.ref ? { ref: b.params.ref } : {}),
            expr: {
                arco: interp(a.params.expr.arco, b.params.expr.arco),
                vivacidad: interp(a.params.expr.vivacidad, b.params.expr.vivacidad),
                calidez: interp(a.params.expr.calidez, b.params.expr.calidez),
            },
        },
        notas: "",
        valoracion: null,
        padres: [a.id, b.id],
        creadaEn: ts,
        modificadaEn: ts,
        promovidaA: [],
    };
}

export function exportarVersiones(): string {
    return JSON.stringify(cargarVersiones(), null, 2);
}

function validarVersion(x: unknown, indice: number): string | null {
    if (typeof x !== "object" || x === null) return `entrada ${indice}: no es un objeto`;
    const v = x as Record<string, unknown>;
    if (typeof v.id !== "string" || !v.id) return `entrada ${indice}: falta «id»`;
    if (typeof v.nombre !== "string" || !v.nombre) return `entrada ${indice}: falta «nombre»`;
    if (typeof v.timbreBase !== "string") return `entrada ${indice}: falta «timbreBase»`;
    if (!MOTORES.includes(v.motor as NivelVoz)) return `entrada ${indice}: «motor» desconocido`;
    if (!TAMANOS.includes(v.tamano as VersionVoz["tamano"])) return `entrada ${indice}: «tamano» desconocido`;
    const p = v.params as Record<string, unknown> | undefined;
    if (typeof p !== "object" || p === null) return `entrada ${indice}: faltan «params»`;
    if (typeof p.voz !== "string") return `entrada ${indice}: falta «params.voz»`;
    if (typeof p.speed !== "number") return `entrada ${indice}: «params.speed» no es número`;
    if (typeof p.instruct !== "string") return `entrada ${indice}: falta «params.instruct»`;
    const e = p.expr as Record<string, unknown> | undefined;
    if (typeof e !== "object" || e === null) return `entrada ${indice}: falta «params.expr»`;
    for (const k of ["arco", "vivacidad", "calidez"]) {
        if (typeof e[k] !== "number") return `entrada ${indice}: «params.expr.${k}» no es número`;
    }
    if (v.valoracion !== null && typeof v.valoracion !== "number") return `entrada ${indice}: «valoracion» inválida`;
    if (!Array.isArray(v.padres)) return `entrada ${indice}: «padres» debe ser un array`;
    if (typeof v.creadaEn !== "string" || typeof v.modificadaEn !== "string") return `entrada ${indice}: faltan fechas`;
    if (!Array.isArray(v.promovidaA)) return `entrada ${indice}: «promovidaA» debe ser un array`;
    return null;
}

/** Importa un JSON de versiones. Nunca lanza: devuelve `{ ok, errores }`. */
export function importarVersiones(json: string): { ok: boolean; errores: string[]; versiones: VersionVoz[] } {
    let datos: unknown;
    try {
        datos = JSON.parse(json);
    } catch {
        return { ok: false, errores: ["el texto no es un JSON válido"], versiones: [] };
    }
    if (!Array.isArray(datos)) {
        return { ok: false, errores: ["el JSON debe ser un array de versiones"], versiones: [] };
    }
    const errores: string[] = [];
    for (let i = 0; i < datos.length; i++) {
        const fallo = validarVersion(datos[i], i);
        if (fallo) errores.push(fallo);
    }
    if (errores.length > 0) return { ok: false, errores, versiones: [] };
    const versiones = datos as VersionVoz[];
    guardarVersiones(versiones);
    return { ok: true, errores: [], versiones };
}

/**
 * Convierte una versión en un Timbre listo para `guardarTimbrePropio`.
 * Toma género, descripción y respaldo de sistema del timbre base si existe;
 * si no, usa valores neutros seguros.
 */
export function aplicarVersionATimbre(v: VersionVoz): Timbre {
    const base = buscarTimbre(v.timbreBase);
    return {
        id: v.id,
        nombre: v.nombre,
        genero: base?.genero ?? "neutra",
        desc: base?.desc ?? "Versión propia del Estudio de Voces",
        local: {
            voz: v.params.voz,
            speed: v.params.speed,
            ...(v.params.instruct ? { instruct: v.params.instruct } : {}),
            ...(v.params.ref ? { ref: v.params.ref } : {}),
        },
        sistema: base?.sistema ?? { bases: ["Paulina", "Mónica", "Monica"], pitch: 0.9, rate: 1.0 },
        expr: { ...v.params.expr },
    };
}
