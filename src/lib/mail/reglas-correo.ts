/*
 * StarSeed OS · Correos inteligentes (INV1025I) — reglas como DATOS.
 * Patrón de Inbox Zero reescrito desde cero (solo lo que describe su README
 * público; no se copia código ni textos). R2 del contrato
 * (`architecture/repos-libreria-1025.md` §1): NINGUNA regla envía, borra ni
 * reenvía. Puro, nunca lanza; Astraura valida aquí su salida.
 */

/** Acciones posibles. Lista CERRADA: nada aquí envía un correo (R2). */
export type AccionCorreo = "etiquetar" | "mover" | "destacar" | "esperar-respuesta" | "sugerir-borrador";
export const ACCIONES_PERMITIDAS: readonly AccionCorreo[] = ["etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador"];
/** Condiciones de disparo: todas las presentes deben cumplirse (AND). */
export interface CondicionesRegla {
    de?: string; dominio?: string; asuntoContiene?: string;
    tieneAdjunto?: boolean; etiqueta?: string; antiguedadHorasMin?: number;
}

/** La regla en sí: un dato, no un programa. */
export interface ReglaCorreo {
    id: string; texto: string; cuando: CondicionesRegla; hacer: AccionCorreo; parametro?: string;
}

/** Hilo mínimo para aplicar reglas, sin importar `os-mail.ts`. */
export interface HiloCorreoLite {
    id: string; asunto: string; deUltimo: string; dominioUltimo: string;
    tieneAdjunto: boolean; etiquetas: string[]; horasDesdeUltimo: number;
}

/** Acción propuesta para un hilo, con la regla de origen. */
export interface AccionPropuesta { reglaId: string; hacer: AccionCorreo; parametro?: string; }
export type ValidacionRegla = { ok: true; regla: ReglaCorreo } | { ok: false; error: string };

const CLAVES_REGLA = new Set(["id", "texto", "cuando", "hacer", "parametro"]);
const CAMPOS_CUANDO_TEXTO: [string, number][] = [["de", 254], ["dominio", 120], ["asuntoContiene", 120], ["etiqueta", 40]];
const CLAVES_CUANDO = new Set([...CAMPOS_CUANDO_TEXTO.map(([k]) => k), "tieneAdjunto", "antiguedadHorasMin"]);

function textoSano(v: unknown, max: number): string | null {
    const t = typeof v === "string" ? v.trim() : "";
    return t && t.length <= max ? t : null;
}
/** ¿Es una de las cinco acciones cerradas? Guardia extra de R2. */
export function esAccionValida(x: unknown): x is AccionCorreo {
    return typeof x === "string" && (ACCIONES_PERMITIDAS as readonly string[]).includes(x);
}
/** Valida una regla propuesta (p. ej. la salida de Astraura): rechaza acciones fuera de la lista cerrada, campos extra, tipos equivocados y textos largos. Nunca lanza. */
export function validarRegla(x: unknown): ValidacionRegla {
    if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "La regla debe ser un objeto." };
    const o = x as Record<string, unknown>;
    const extra = Object.keys(o).find((k) => !CLAVES_REGLA.has(k));
    if (extra) return { ok: false, error: `Campo extra: «${extra}».` };
    const id = textoSano(o.id, 48);
    if (!id) return { ok: false, error: "«id» debe ser un texto de 1 a 48 caracteres." };
    const texto = textoSano(o.texto, 300);
    if (!texto) return { ok: false, error: "«texto» debe ser un texto de 1 a 300 caracteres." };
    if (!esAccionValida(o.hacer)) return { ok: false, error: "«hacer» debe ser una acción cerrada (etiquetar, mover, destacar, esperar-respuesta o sugerir-borrador). Ninguna regla envía, borra ni reenvía." };
    const cuando = validarCondiciones(o.cuando);
    if (typeof cuando === "string") return { ok: false, error: cuando };
    const regla: ReglaCorreo = { id, texto, cuando, hacer: o.hacer };
    if (o.parametro === undefined) return { ok: true, regla };
    const p = textoSano(o.parametro, 254);
    if (!p) return { ok: false, error: "«parametro» debe ser un texto de 1 a 254 caracteres." };
    regla.parametro = p;
    return { ok: true, regla };
}

/** Valida `cuando`: solo sus seis claves, tipos correctos y rangos sanos. */
function validarCondiciones(x: unknown): CondicionesRegla | string {
    if (x === undefined) return {};
    if (!x || typeof x !== "object" || Array.isArray(x)) return "«cuando» debe ser un objeto de condiciones.";
    const o = x as Record<string, unknown>;
    const c: CondicionesRegla = {};
    const extra = Object.keys(o).find((k) => !CLAVES_CUANDO.has(k));
    if (extra) return `Condición extra: «${extra}».`;
    for (const [k, max] of CAMPOS_CUANDO_TEXTO) {
        if (o[k] === undefined) continue;
        const t = textoSano(o[k], max);
        if (!t) return `«cuando.${k}» debe ser un texto de 1 a ${max} caracteres.`;
        (c as Record<string, unknown>)[k] = t;
    }
    if (o.tieneAdjunto !== undefined) {
        if (typeof o.tieneAdjunto !== "boolean") return "«cuando.tieneAdjunto» debe ser booleano.";
        c.tieneAdjunto = o.tieneAdjunto;
    }
    const n = o.antiguedadHorasMin;
    if (n !== undefined) {
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 87600) return "«cuando.antiguedadHorasMin» debe ser un número de 0 a 87600 horas.";
        c.antiguedadHorasMin = n;
    }
    return c;
}
/** Aplica reglas (las inválidas se saltan sin lanzar) a un hilo mínimo. Devuelve las acciones propuestas en el orden de las reglas y sin repetir: una misma acción (hacer + parametro) no aparece dos veces. Una acción fuera de la cerrada nunca se propone; un `cuando` vacío encaja con cualquier hilo. */
export function aplicarReglas(reglas: unknown[], hilo: HiloCorreoLite): AccionPropuesta[] {
    if (!Array.isArray(reglas)) return [];
    const vistas = new Set<string>();
    const propuestas: AccionPropuesta[] = [];
    for (const r of reglas) {
        const v = validarRegla(r);
        if (!v.ok || !encajan(v.regla.cuando, hilo)) continue;
        const firma = `${v.regla.hacer}|${v.regla.parametro ?? ""}`;
        if (vistas.has(firma)) continue;
        vistas.add(firma);
        propuestas.push({
            reglaId: v.regla.id, hacer: v.regla.hacer,
            ...(v.regla.parametro !== undefined ? { parametro: v.regla.parametro } : {}),
        });
    }
    return propuestas;
}

/** ¿Cumple el hilo TODAS las condiciones de la regla (AND)? */
function encajan(c: CondicionesRegla, hilo: HiloCorreoLite): boolean {
    if (c.de && !hilo.deUltimo.toLowerCase().includes(c.de.toLowerCase())) return false;
    if (c.dominio && hilo.dominioUltimo.toLowerCase() !== c.dominio.toLowerCase()) return false;
    if (c.asuntoContiene && !hilo.asunto.toLowerCase().includes(c.asuntoContiene.toLowerCase())) return false;
    if (c.tieneAdjunto !== undefined && hilo.tieneAdjunto !== c.tieneAdjunto) return false;
    if (c.etiqueta && !hilo.etiquetas.includes(c.etiqueta)) return false;
    if (c.antiguedadHorasMin !== undefined && hilo.horasDesdeUltimo < c.antiguedadHorasMin) return false;
    return true;
}
