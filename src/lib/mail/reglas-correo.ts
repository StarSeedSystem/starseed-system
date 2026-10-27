/*
 * StarSeed OS · Correos inteligentes: reglas como datos. Patrón «reglas en
 * lenguaje natural» reescrito desde cero (solo el concepto público de Inbox
 * Zero, sin copiar código ni textos). La regla es un DATO validado que
 * Astraura produce; aquí se valida y se aplica sobre hilos del correo
 * interno (`os_dm_threads` con `meta.mail`). R2: nada envía, responde,
 * borra ni reenvía; solo propone acciones seguras. Puro: sin red ni disco.
 */
export type AccionCorreo = "etiquetar" | "mover" | "destacar" | "esperar-respuesta" | "sugerir-borrador";

export interface CuandoRegla {
    de?: string;
    dominio?: string;
    asuntoContiene?: string;
    tieneAdjunto?: boolean;
    etiqueta?: string;
    antiguedadHorasMin?: number;
}

export interface ReglaCorreo {
    id: string;
    texto: string;
    cuando: CuandoRegla;
    hacer: AccionCorreo;
    parametro?: string;
}

export interface HiloRegla {
    id: string;
    creatorId: string;
    subject: string;
    ultimoDe: string | null;
    tieneAdjunto: boolean;
    etiqueta: string | null;
    createdAt: string;
    lastMsgAt: string;
}
/** Propuesta de acción sobre un hilo. Nunca una ejecución (R2). */
export interface PropuestaAccion {
    reglaId: string;
    hacer: AccionCorreo;
    parametro?: string;
}

export const ACCIONES_VALIDAS: readonly AccionCorreo[] = [
    "etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador",
] as const;

export const CAMPOS_CUANDO: readonly (keyof CuandoRegla)[] = [
    "de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin",
] as const;

function esTextoValido(v: unknown, max: number): v is string {
    return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function validarCuando(c: unknown): CuandoRegla | null {
    if (typeof c !== "object" || c === null || Array.isArray(c)) return null;
    const crudo = c as Record<string, unknown>;
    const claves = Object.keys(crudo);
    if (claves.length === 0) return null;
    const cuando: CuandoRegla = {};
    for (const clave of claves) {
        if (!CAMPOS_CUANDO.some((campo) => campo === clave)) return null;
        const valor = crudo[clave];
        if (clave === "tieneAdjunto") {
            if (typeof valor !== "boolean") return null;
            cuando.tieneAdjunto = valor;
        } else if (clave === "antiguedadHorasMin") {
            if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
            cuando.antiguedadHorasMin = valor;
        } else if (esTextoValido(valor, clave === "asuntoContiene" ? 120 : 80)) {
            const campo = clave as "de" | "dominio" | "asuntoContiene" | "etiqueta";
            cuando[campo] = valor;
        } else {
            return null;
        }
    }
    return cuando;
}

/** Valida una regla candidata. Devuelve null si es inválida: nunca lanza. */
export function validarRegla(x: unknown): ReglaCorreo | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const crudo = x as Record<string, unknown>;
    const permitidas = ["cuando", "hacer", "id", "parametro", "texto"];
    if (Object.keys(crudo).some((k) => !permitidas.includes(k))) return null;
    if (!esTextoValido(crudo.id, 60) || !esTextoValido(crudo.texto, 200)) return null;
    const cuando = validarCuando(crudo.cuando);
    if (!cuando || !ACCIONES_VALIDAS.some((a) => a === crudo.hacer)) return null;
    const regla: ReglaCorreo = { id: crudo.id, texto: crudo.texto, cuando, hacer: crudo.hacer as AccionCorreo };
    if (crudo.parametro !== undefined) {
        const conParametro = regla.hacer === "mover" || regla.hacer === "etiquetar";
        if (!conParametro || !esTextoValido(crudo.parametro, 80)) return null;
        regla.parametro = crudo.parametro;
    } else if (regla.hacer === "mover" || regla.hacer === "etiquetar") {
        return null;
    }
    return regla;
}

function cumple(r: CuandoRegla, h: HiloRegla, ahora: Date): boolean {
    if (r.de && h.ultimoDe !== r.de) return false;
    if (r.dominio && !(h.ultimoDe ?? "").toLowerCase().endsWith("@" + r.dominio.toLowerCase())) return false;
    if (r.asuntoContiene && !h.subject.toLowerCase().includes(r.asuntoContiene.toLowerCase())) return false;
    if (r.tieneAdjunto !== undefined && h.tieneAdjunto !== r.tieneAdjunto) return false;
    if (r.etiqueta && h.etiqueta !== r.etiqueta) return false;
    const t = new Date(h.lastMsgAt).getTime();
    const antiguedadHoras = Number.isFinite(t) ? (ahora.getTime() - t) / 3_600_000 : -1;
    if (r.antiguedadHorasMin !== undefined && antiguedadHoras < r.antiguedadHorasMin) return false;
    return true;
}

/** Aplica reglas a un hilo: propuestas en orden de regla, sin repetir. */
export function aplicarReglas(reglas: ReglaCorreo[], hilo: HiloRegla, ahora: Date = new Date()): PropuestaAccion[] {
    const vistas = new Set<string>();
    const propuestas: PropuestaAccion[] = [];
    for (const regla of reglas) {
        if (!cumple(regla.cuando, hilo, ahora)) continue;
        const clave = `${regla.hacer}|${regla.parametro ?? ""}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        const p: PropuestaAccion = { reglaId: regla.id, hacer: regla.hacer };
        if (regla.parametro !== undefined) p.parametro = regla.parametro;
        propuestas.push(p);
    }
    return propuestas;
}
