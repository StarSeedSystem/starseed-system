/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Correos inteligentes (1): reglas en lenguaje natural como DATOS
 * ---------------------------------------------------------------------------
 * Patrón de producto de Inbox Zero (AGPL con términos adicionales): NO se
 * copia código ni textos; se reescribe desde cero lo que describe su README
 * público. Una regla de correo es un dato validado, nunca código ejecutado.
 *
 * Pasar de lenguaje natural a regla lo hace Astraura en otra tarea: aquí solo
 * se VALIDA su salida y se aplica sobre un hilo literal.
 *
 * Regla dura R2 (architecture/repos-libreria-1025.md §7): ninguna regla envía
 * nada. Las únicas acciones son etiquetar, mover, destacar, esperar-respuesta
 * y sugerir-borrador (un borrador es texto: la persona lo revisa y lo envía).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AccionCorreo =
    | "etiquetar"
    | "mover"
    | "destacar"
    | "esperar-respuesta"
    | "sugerir-borrador";

export interface CondicionRegla {
    de?: string;
    dominio?: string;
    asuntoContiene?: string;
    tieneAdjunto?: boolean;
    etiqueta?: string;
    /** Hora del último mensaje del hilo: la regla solo aplica si pasó este mínimo. */
    antiguedadHorasMin?: number;
}

export interface ReglaCorreo {
    id: string;
    texto: string;
    cuando: CondicionRegla;
    hacer: AccionCorreo;
    /** Destino de la acción (texto de la etiqueta, carpeta o borrador). */
    parametro?: string;
}

export interface HiloLite {
    id: string;
    /** Remitente del último mensaje (direccion o id). */
    de?: string;
    /** Asunto del hilo. */
    asunto?: string;
    tieneAdjunto?: boolean;
    /** Etiquetas ya puestas al hilo. */
    etiquetas?: string[];
    /** Horas transcurridas desde el último mensaje. */
    horasDesdeUltimo?: number;
}

export interface AccionPropuesta {
    reglaId: string;
    hacer: AccionCorreo;
    parametro?: string;
}

/* ───────────────────────────── Aplicación ──────────────────────────────── */

function coincidencia(a?: string, b?: string): boolean {
    return typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function cuandoSeCumple(c: CondicionRegla, hilo: HiloLite): boolean {
    if (c.de !== undefined && !coincidencia(c.de, hilo.de)) return false;
    if (c.dominio !== undefined) {
        const de = hilo.de || "";
        const at = de.lastIndexOf("@");
        const dominioDelRemitente = at >= 0 ? de.slice(at + 1).toLowerCase() : "";
        if (dominioDelRemitente !== c.dominio.toLowerCase()) return false;
    }
    if (c.asuntoContiene !== undefined) {
        if (!hilo.asunto || !hilo.asunto.toLowerCase().includes(c.asuntoContiene.toLowerCase())) return false;
    }
    if (c.tieneAdjunto !== undefined && hilo.tieneAdjunto !== c.tieneAdjunto) return false;
    if (c.etiqueta !== undefined) {
        if (!hilo.etiquetas || !hilo.etiquetas.some((e) => coincidencia(e, c.etiqueta))) return false;
    }
    if (c.antiguedadHorasMin !== undefined) {
        if (hilo.horasDesdeUltimo === undefined || hilo.horasDesdeUltimo < c.antiguedadHorasMin) return false;
    }
    return true;
}

/**
 * Aplica reglas ya validadas a un hilo y devuelve las acciones propuestas,
 * en el orden de las reglas y sin repetir (misma acción + parámetro).
 * Nunca envía nada: solo propone.
 */
export function aplicarReglas(reglas: ReglaCorreo[], hilo: HiloLite): AccionPropuesta[] {
    const vistas = new Set<string>();
    const salida: AccionPropuesta[] = [];
    for (const regla of reglas) {
        if (!regla || !coincidenciasValidas(regla)) continue;
        if (!cuandoSeCumple(regla.cuando, hilo)) continue;
        const clave = `${regla.hacer}|${regla.parametro ?? ""}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        const accion: AccionPropuesta = { reglaId: regla.id, hacer: regla.hacer };
        if (regla.parametro !== undefined) accion.parametro = regla.parametro;
        salida.push(accion);
    }
    return salida;
}

function coincidenciasValidas(r: ReglaCorreo): boolean {
    return textoOk(r.id, 80) && textoOk(r.texto, 300) && ACCIONES_VALIDAS.includes(r.hacer);
}

/* ─────────────────────────── Validación ────────────────────────────────── */

const ACCIONES_VALIDAS: readonly AccionCorreo[] = [
    "etiquetar",
    "mover",
    "destacar",
    "esperar-respuesta",
    "sugerir-borrador",
];

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function textoOk(v: unknown, max: number): v is string {
    return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function validarCondicion(x: unknown): CondicionRegla | null {
    if (!esObjeto(x)) return null;
    const clavesPermitidas = ["de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin"];
    for (const k of Object.keys(x)) {
        if (!clavesPermitidas.includes(k)) return null;
    }
    const c: CondicionRegla = {};
    if ("de" in x) {
        if (!textoOk(x.de, 120)) return null;
        c.de = (x.de as string).trim();
    }
    if ("dominio" in x) {
        if (!textoOk(x.dominio, 120)) return null;
        const dominio = String(x.dominio).trim().toLowerCase();
        // Un dominio válido no lleva espacios ni "@": es la parte tras la arroba.
        if (dominio.includes(" ") || dominio.includes("@")) return null;
        c.dominio = dominio;
    }
    if ("asuntoContiene" in x) {
        if (!textoOk(x.asuntoContiene, 120)) return null;
        c.asuntoContiene = (x.asuntoContiene as string).trim();
    }
    if ("tieneAdjunto" in x) {
        if (typeof x.tieneAdjunto !== "boolean") return null;
        c.tieneAdjunto = x.tieneAdjunto;
    }
    if ("etiqueta" in x) {
        if (!textoOk(x.etiqueta, 60)) return null;
        c.etiqueta = (x.etiqueta as string).trim();
    }
    if ("antiguedadHorasMin" in x) {
        if (typeof x.antiguedadHorasMin !== "number" || !Number.isFinite(x.antiguedadHorasMin) || x.antiguedadHorasMin < 0) return null;
        c.antiguedadHorasMin = x.antiguedadHorasMin;
    }
    return c;
}

/**
 * Valida una regla propuesta (sin importar de dónde venga). Rechaza
 * acciones fuera de la lista (jamás enviar, responder sola, borrar ni
 * reenviar), campos extra y textos demasiado largos. Devuelve null si
 * la regla no sirve.
 */
export function validarRegla(x: unknown): ReglaCorreo | null {
    if (!esObjeto(x)) return null;
    for (const k of Object.keys(x)) {
        if (!["id", "texto", "cuando", "hacer", "parametro"].includes(k)) return null;
    }
    if (!textoOk(x.id, 80) || !textoOk(x.texto, 300)) return null;
    const cuando = validarCondicion(x.cuando);
    if (!cuando || Object.keys(cuando).length === 0) return null;
    if (typeof x.hacer !== "string" || !ACCIONES_VALIDAS.includes(x.hacer as AccionCorreo)) return null;
    const regla: ReglaCorreo = { id: (x.id as string).trim(), texto: (x.texto as string).trim(), cuando, hacer: x.hacer as AccionCorreo };
    if ("parametro" in x) {
        if (typeof x.parametro !== "string" || x.parametro.trim().length > 200) return null;
        if (x.parametro.trim()) regla.parametro = x.parametro.trim();
    }
    return regla;
}
