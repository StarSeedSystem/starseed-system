/** Reglas del correo como DATOS (Ola 1025R · INV1025I). Patrón de producto reescrito desde cero
 * (Inbox Zero: solo lo que describe su README público; nada de su código ni sus textos). Una
 * regla es un dato que Astraura valida y aplica a hilos; jamás envía, responde ni borra. Puro. */

/** Acciones permitidas (lista cerrada): nunca «enviar», «responder», «borrar» ni «reenviar». */
export type AccionCorreo = "etiquetar" | "mover" | "destacar" | "esperar-respuesta" | "sugerir-borrador";
export const ACCIONES_CORREO: readonly AccionCorreo[] = [
    "etiquetar", "mover", "destacar", "esperar-respuesta", "sugerir-borrador",
];
/** Condiciones de la regla (todas opcionales; se exigen todas las que estén). */
export interface CondicionRegla {
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
    cuando: CondicionRegla;
    hacer: AccionCorreo;
    parametro?: string;
}
/** Hilo mínimo que las reglas leen; las horas ya están calculadas (reloj inyectado fuera). */
export interface HiloCorreosLite {
    id: string;
    remitente: string;
    asunto: string;
    tieneAdjunto: boolean;
    etiquetas: string[];
    horasDesdeUltimoMensaje: number;
}
export type AccionPropuesta = { hacer: AccionCorreo; parametro?: string };
export type ResultadoRegla = { ok: true; regla: ReglaCorreo } | { ok: false; error: string };
export const LIMITES_REGLA = { id: 64, texto: 200, cadena: 80, antiguedad: 24 * 365 } as const;

export function validarRegla(x: unknown): ResultadoRegla {
    if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "La regla debe ser un objeto." };
    const o = x as Record<string, unknown>;
    const id = o["id"];
    if (typeof id !== "string" || !id.trim() || id.length > LIMITES_REGLA.id)
        return { ok: false, error: `«id» inválido o vacío (≤ ${LIMITES_REGLA.id} caracteres).` };
    const texto = o["texto"];
    if (typeof texto !== "string" || texto.length > LIMITES_REGLA.texto)
        return { ok: false, error: `«texto» debe ser una cadena corta (≤ ${LIMITES_REGLA.texto} caracteres).` };
    // Lista cerrada: cualquier cosa fuera —p. ej. «enviar» o «borrar»— se rechaza.
    const hacer = o["hacer"];
    if (typeof hacer !== "string" || !ACCIONES_CORREO.includes(hacer as AccionCorreo))
        return { ok: false, error: `Acción inválida: las permitidas son ${ACCIONES_CORREO.join(", ")}.` };
    const c = validarCuando(o["cuando"]);
    if (!c.ok) return c;
    const parametro = o["parametro"];
    if (parametro !== undefined && (typeof parametro !== "string" || parametro.length > LIMITES_REGLA.cadena))
        return { ok: false, error: `«parametro» debe ser una cadena corta (≤ ${LIMITES_REGLA.cadena} caracteres).` };
    for (const k of Object.keys(o))
        if (!["id", "texto", "cuando", "hacer", "parametro"].includes(k))
            return { ok: false, error: `Campo no permitido: «${k}».` };
    const regla: ReglaCorreo = { id, texto, cuando: c.condicion, hacer: hacer as AccionCorreo };
    if (typeof parametro === "string") regla.parametro = parametro;
    return { ok: true, regla };
}

function validarCuando(valor: unknown): { ok: true; condicion: CondicionRegla } | { ok: false; error: string } {
    if (!valor || typeof valor !== "object" || Array.isArray(valor))
        return { ok: false, error: "«cuando» debe ser un objeto de condiciones." };
    const o = valor as Record<string, unknown>;
    const claves = ["de", "dominio", "asuntoContiene", "tieneAdjunto", "etiqueta", "antiguedadHorasMin"];
    for (const k of Object.keys(o))
        if (!claves.includes(k)) return { ok: false, error: `Condición no permitida: «${k}».` };
    const cond: CondicionRegla = {};
    for (const k of ["de", "dominio", "asuntoContiene", "etiqueta"]) {
        const v = o[k];
        if (v === undefined) continue;
        if (typeof v !== "string" || v.length > LIMITES_REGLA.cadena)
            return { ok: false, error: `«${k}» debe ser una cadena corta (≤ ${LIMITES_REGLA.cadena} caracteres).` };
        (cond as Record<string, unknown>)[k] = v;
    }
    const adj = o["tieneAdjunto"];
    if (adj !== undefined) {
        if (typeof adj !== "boolean") return { ok: false, error: "«tieneAdjunto» debe ser booleano." };
        cond.tieneAdjunto = adj;
    }
    const ant = o["antiguedadHorasMin"];
    if (ant !== undefined) {
        if (typeof ant !== "number" || !Number.isFinite(ant) || ant < 0 || ant > LIMITES_REGLA.antiguedad)
            return { ok: false, error: `«antiguedadHorasMin» debe ser un número entre 0 y ${LIMITES_REGLA.antiguedad}.` };
        cond.antiguedadHorasMin = ant;
    }
    if (Object.keys(cond).length === 0) return { ok: false, error: "«cuando» necesita al menos una condición." };
    return { ok: true, condicion: cond };
}

/** La condición encaja si TODOS sus campos presentes coinciden con el hilo. */
function encaja(cuando: CondicionRegla, hilo: HiloCorreosLite): boolean {
    const remitente = hilo.remitente.toLowerCase().trim();
    if (cuando.de !== undefined && remitente !== cuando.de.toLowerCase().trim()) return false;
    if (cuando.dominio !== undefined && !remitente.endsWith(`@${cuando.dominio.toLowerCase().trim()}`)) return false;
    if (cuando.asuntoContiene !== undefined && !hilo.asunto.toLowerCase().includes(cuando.asuntoContiene.toLowerCase())) return false;
    if (cuando.tieneAdjunto !== undefined && hilo.tieneAdjunto !== cuando.tieneAdjunto) return false;
    if (cuando.etiqueta !== undefined && !hilo.etiquetas.includes(cuando.etiqueta)) return false;
    if (cuando.antiguedadHorasMin !== undefined && hilo.horasDesdeUltimoMensaje < cuando.antiguedadHorasMin) return false;
    return true;
}

/** Acciones que las reglas proponen para el hilo: en orden y sin repetir. */
export function aplicarReglas(reglas: ReglaCorreo[], hilo: HiloCorreosLite): AccionPropuesta[] {
    const propuestas: AccionPropuesta[] = [];
    const vistas = new Set<string>();
    for (const regla of reglas) {
        if (!encaja(regla.cuando, hilo)) continue;
        const llave = `${regla.hacer}|${regla.parametro ?? ""}`;
        if (vistas.has(llave)) continue;
        vistas.add(llave);
        propuestas.push(
            regla.parametro !== undefined ? { hacer: regla.hacer, parametro: regla.parametro } : { hacer: regla.hacer },
        );
    }
    return propuestas;
}