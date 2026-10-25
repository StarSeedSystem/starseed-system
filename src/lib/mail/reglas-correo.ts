"use client";

/*
 * Reglas de correo como DATOS (Ola 1025R · INV1025I · patrón Inbox Zero reescrito desde cero,
 * solo sus conceptos públicos de README — AGPL con términos adicionales). Una regla es un objeto
 * plano que Astraura propone y aquí se valida y se aplica. Nada envía: solo etiquetas, movidas,
 * destacados, avisos de espera y SUGERENCIAS de borrador (R2 · envío solo con aprobación humana).
 */

export interface CuandoRegla {
    de?: string; dominio?: string; asuntoContiene?: string;
    tieneAdjunto?: boolean; etiqueta?: string; antiguedadHorasMin?: number;
}

export type AccionCorreo = "etiquetar" | "mover" | "destacar" | "esperar-respuesta" | "sugerir-borrador";

export interface ReglaCorreo {
    id: string; texto: string; cuando: CuandoRegla;
    hacer: AccionCorreo; parametro?: string;
}

export interface AccionPropuesta { reglaId: string; hacer: AccionCorreo; parametro: string }

export interface MensajeLite { de: string; en: string; tieneAdjunto: boolean }

export interface HiloLite {
    id: string; asunto: string; creatorId: string; memberIds: string[];
    etiqueta: string | null; mensajes: MensajeLite[];
}

export const ACCIONES_VALIDAS: readonly AccionCorreo[] = [
    "etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador",
] as const;

type Obj = Record<string, unknown>;
function esObjeto(v: unknown): v is Obj { return typeof v === "object" && v !== null && !Array.isArray(v); }
function textoValido(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t && t.length <= max ? t : null;
}

/** Rechaza cualquier acción fuera de la lista, campos extra y textos largos. */
export function validarRegla(x: unknown): ReglaCorreo | null {
    if (!esObjeto(x)) return null;
    if (!Object.keys(x).every((k) => new Set(["id", "texto", "cuando", "hacer", "parametro"]).has(k))) return null;
    const id = textoValido(x.id, 80);
    const texto = textoValido(x.texto, 240);
    if (!id || !texto || !ACCIONES_VALIDAS.includes(x.hacer as AccionCorreo)) return null;
    const cuando = validarCuando(x.cuando);
    if (!cuando) return null;
    const parametro = "parametro" in x ? textoValido(x.parametro, 120) : "";
    if ("parametro" in x && !parametro) return null;
    return { id, texto, cuando, hacer: x.hacer as AccionCorreo, parametro: parametro || undefined };
}

function validarCuando(v: unknown): CuandoRegla | null {
    if (!esObjeto(v)) return null;
    const claves = new Set(["de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin"]);
    if (!Object.keys(v).every((k) => claves.has(k))) return null;
    const c: CuandoRegla = {};
    for (const k of ["de", "dominio", "asuntoContiene", "etiqueta"] as const) {
        if (k in v) {
            const t = textoValido(v[k], 160);
            if (!t) return null;
            c[k] = t;
        }
    }
    if ("tieneAdjunto" in v) {
        if (typeof v.tieneAdjunto !== "boolean") return null;
        c.tieneAdjunto = v.tieneAdjunto;
    }
    if ("antiguedadHorasMin" in v) {
        const n = v.antiguedadHorasMin;
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
        c.antiguedadHorasMin = n;
    }
    return c;
}

interface Coincidencia { de: string; dominio: string; asunto: string; adjunto: boolean; etiqueta: string | null; horas: number }

/** Coincidencias en minúscula a partir del ÚLTIMO mensaje del hilo. */
function coincidencias(hilo: HiloLite, ahora: number): Coincidencia {
    const ultimo = hilo.mensajes.length ? hilo.mensajes[hilo.mensajes.length - 1] : null;
    const de = (ultimo?.de || "").trim().toLowerCase();
    const enArroba = de.lastIndexOf("@");
    const hora = ultimo ? Date.parse(ultimo.en) : NaN;
    return {
        de,
        dominio: enArroba >= 0 && enArroba < de.length - 1 ? de.slice(enArroba + 1) : "",
        asunto: (hilo.asunto || "").trim().toLowerCase(),
        adjunto: hilo.mensajes.some((m) => m.tieneAdjunto),
        etiqueta: hilo.etiqueta ? hilo.etiqueta.trim().toLowerCase() : null,
        horas: Number.isFinite(hora) ? Math.max(0, (ahora - hora) / 36e5) : 0,
    };
}

/** ¿La regla aplica? Solo lectura: jamás muta el hilo ni envía nada (R2). */
function aplica(cuando: CuandoRegla, c: Coincidencia): boolean {
    if (cuando.de && c.de !== cuando.de.toLowerCase()) return false;
    if (cuando.dominio && c.dominio !== cuando.dominio.toLowerCase()) return false;
    if (cuando.asuntoContiene && !c.asunto.includes(cuando.asuntoContiene.toLowerCase())) return false;
    if (cuando.tieneAdjunto !== undefined && c.adjunto !== cuando.tieneAdjunto) return false;
    if (cuando.etiqueta && c.etiqueta !== cuando.etiqueta.toLowerCase()) return false;
    if (cuando.antiguedadHorasMin !== undefined && c.horas < cuando.antiguedadHorasMin) return false;
    // Una regla sin ninguna condición no decide nada: se ignora (freno honesto).
    return Boolean(
        cuando.de !== undefined || cuando.dominio !== undefined || cuando.asuntoContiene !== undefined ||
        cuando.tieneAdjunto !== undefined || cuando.etiqueta !== undefined || cuando.antiguedadHorasMin !== undefined,
    );
}

/**
 * Aplica reglas a un hilo: acciones PROPUESTAS, en orden y sin repetir (misma acción con el
 * mismo parámetro sale una sola vez). Puro: el tiempo entra inyectado y quien llama —Correos,
 * el alcance o Mensajes— decide qué hacer; aquí no se envía ni se escribe nada (R2).
 */
export function aplicarReglas(reglas: ReglaCorreo[], hilo: HiloLite, ahora: Date = new Date()): AccionPropuesta[] {
    if (!Array.isArray(reglas) || !hilo || !Array.isArray(hilo.mensajes)) return [];
    const c = coincidencias(hilo, ahora.getTime());
    const vistas = new Set<string>();
    const out: AccionPropuesta[] = [];
    for (const r of reglas) {
        if (!r || !r.cuando || !aplica(r.cuando, c)) continue;
        const parametro = r.parametro ?? "";
        const clave = `${r.hacer}|${parametro}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        out.push({ reglaId: r.id, hacer: r.hacer, parametro });
    }
    return out;
}
