/**
 * identidad-voz.ts — UN resolutor de identidad de voz por persona (Ola 1015V · M).
 * Contrato: `architecture/voz-fusionada-astraura.md` §3 («Una sola identidad por
 * persona»). Coordina los seis mapas que ya existían SIN borrarlos: VOZ_POR_PERSONA
 * (voz-rt, la voz F1-M4), los pines del registro (engine-registry, el motor), el
 * catálogo de timbres (timbres.ts, con el INSTRUCT del demonio), seedKindFor
 * (openvoice2, la semilla) y XAI_PERSONA_VOICES (la voz xAI). Las elecciones por
 * ámbito entran inyectadas; su cableado es la tarea siguiente, como el router ya
 * hace con la jerarquía de motor (`resolveVoiceChoiceFrom`, SGO1024D).
 * Precedencia: agente › personalidad › cerebro › neurona › cuenta › defecto.
 * Nunca lanza («Aurora SIEMPRE habla»); sin `window`, manda el defecto del OS.
 */
import { VOZ_POR_PERSONA } from "@/lib/aurora/voz-rt";
import { TIMBRE_PREDETERMINADO, buscarTimbre } from "@/lib/aurora/timbres";
import { personalityVoiceEnginePin } from "@/lib/aurora/tts-oss/engine-registry";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { XAI_PERSONA_VOICES, isXaiPersonaId } from "@/lib/aurora/tts-oss/xai-persona-voices";
import { safeGet } from "@/lib/safe-storage";

export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

export interface IdentidadVoz {
    timbre: string;
    motor: string;
    vozRT: string;
    /** INSTRUCT del demonio para este timbre (whitelist del backend OmniVoice). */
    instruct?: string;
    /** Semilla de identidad de OpenVoice2 («aurora» · «hermione» · custom). */
    semilla?: string;
    /** Voz built-in del agente xAI (eve/ara/rex/sal/leo). */
    xai?: string;
    /** La capa más específica que aporta ALGÚN dato; «defecto» si nadie. */
    origen: OrigenIdentidadVoz;
}

/** Lo que un ámbito puede fijar: el resto de campos hereda del siguiente. */
export interface EleccionIdentidadVoz {
    timbre?: string;
    motor?: string;
    vozRT?: string;
}

/** Elecciones por ámbito (cada uno un mapa `<id>` → elección); `cuenta` incluida. */
export interface FuentesIdentidadVoz {
    cuenta?: Record<string, EleccionIdentidadVoz>;
    porNeurona?: Record<string, EleccionIdentidadVoz>;
    porCerebro?: Record<string, EleccionIdentidadVoz>;
    porAgente?: Record<string, EleccionIdentidadVoz>;
    porPersonalidad?: Record<string, EleccionIdentidadVoz>;
}

export interface ContextoIdentidadVoz {
    agente?: string | null;
    personalidad?: string | null;
    cerebro?: string | null;
    neurona?: string | null;
    cuenta?: string | null;
}

/** «openvoice2»: el pin del registro sin nadie que lo fije (Adendas 81/86/90). */
export const MOTOR_DEFECTO = "openvoice2";

/** Las capas, de la más específica a la más general: [origen, mapa de fuentes]. */
const ORDEN_CAPAS = [
    ["agente", "porAgente"],
    ["personalidad", "porPersonalidad"],
    ["cerebro", "porCerebro"],
    ["neurona", "porNeurona"],
    ["cuenta", "cuenta"],
] as const;

/** Texto plano válido, o null. Nunca lanza; sin claves ni caracteres de control. */
function limpiar(v: unknown, patron?: RegExp, max = 120): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    // eslint-disable-next-line no-control-regex
    if (!s || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) return null;
    return patron && !patron.test(s) ? null : s;
}

/** Una elección válida o null; los campos sueltos incorrectos se descartan solos. */
export function eleccionLimpia(raw: unknown): EleccionIdentidadVoz | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const e: EleccionIdentidadVoz = {};
    const timbre = limpiar(o.timbre);
    if (timbre) e.timbre = timbre;
    const motor = limpiar(o.motor, /^[a-z0-9][a-z0-9_-]*$/);
    if (motor) e.motor = motor;
    const vozRT = limpiar(o.vozRT, /^[FM][1-5]$/);
    if (vozRT) e.vozRT = vozRT;
    return Object.keys(e).length ? e : null;
}

/** Sanea lo que venga del exterior. Nunca lanza. */
export function sanitizarFuentes(input: unknown): FuentesIdentidadVoz {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const o = input as Record<string, unknown>;
    const out: FuentesIdentidadVoz = {};
    for (const capa of ORDEN_CAPAS) {
        const mapa = o[capa[1]];
        if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) continue;
        const limpio: Record<string, EleccionIdentidadVoz> = {};
        for (const [id, e] of Object.entries(mapa as Record<string, unknown>).slice(0, 300)) {
            const eLimpia = eleccionLimpia(e);
            if (limpiar(id, /^[a-zA-Z0-9_*.:\/-]+$/, 64) && eLimpia) limpio[id] = eLimpia;
        }
        if (Object.keys(limpio).length) (out as Record<string, unknown>)[capa[1]] = limpio;
    }
    return out;
}

/** Resolución PURA: campo a campo gana el ámbito más específico; `origen` nombra a quien aportó. */
export function resolverIdentidadVoz(
    defecto: IdentidadVoz,
    fuentes: FuentesIdentidadVoz | null | undefined,
    ctx: ContextoIdentidadVoz,
): IdentidadVoz {
    const idDe: Partial<Record<string, string | null | undefined>> = {
        porAgente: ctx.agente,
        porPersonalidad: ctx.personalidad,
        porCerebro: ctx.cerebro,
        porNeurona: ctx.neurona,
        cuenta: ctx.cuenta ?? "*",
    };
    const out: IdentidadVoz = { ...defecto, origen: defecto.origen };
    const asignado = new Set<string>();
    let origen: OrigenIdentidadVoz | null = null;
    for (const capa of ORDEN_CAPAS) {
        const e = idDe[capa[1]] ? fuentes?.[capa[1]]?.[idDe[capa[1]]] : undefined;
        if (!e) continue;
        for (const campo of ["timbre", "motor", "vozRT"] as const) {
            if (!e[campo] || asignado.has(campo)) continue;
            asignado.add(campo);
            (out as unknown as Record<string, string>)[campo] = e[campo];
            if (!origen) origen = capa[0];
        }
        // El instruct va pegado al timbre: si cambió, la fachada lo re-deriva.
        if (asignado.has("timbre")) delete out.instruct;
    }
    return { ...out, origen: origen ?? "defecto" };
}

/** El INSTRUCT del demonio para un id de timbre, o undefined. Nunca lanza. */
function instructDeTimbre(id: string): string | undefined {
    return buscarTimbre(id)?.local.instruct || undefined;
}

/** El defecto del OS para una persona, leído de los seis mapas existentes. */
export function identidadVozPorDefecto(personaId?: string | null): IdentidadVoz {
    const id = (personaId || "").trim().toLowerCase().replace(/\s+/g, "_");
    // Mapa 1 — VOZ_POR_PERSONA: la voz rápida. Alex habló y su Astraura es F1.
    const vozRT = VOZ_POR_PERSONA[id] ?? "F1";
    // Mapa 3 — timbres: receta fija por género; el INSTRUCT sale del timbre.
    const timbre = vozRT.startsWith("M") ? TIMBRE_PREDETERMINADO.masculina : TIMBRE_PREDETERMINADO.femenina;
    return {
        timbre,
        // Mapas 2/5/6 — pin del registro (incluye el override A149), semilla y voz xAI.
        motor: personalityVoiceEnginePin() || MOTOR_DEFECTO,
        vozRT,
        instruct: instructDeTimbre(timbre),
        semilla: seedKindFor(id || undefined) ?? undefined,
        xai: isXaiPersonaId(id) ? XAI_PERSONA_VOICES[id].voice : undefined,
        origen: "defecto",
    };
}

/** El resolutor único de un turno: `fuentes` inyectable; sin él, lee el navegador. */
export function identidadVoz(ctx: ContextoIdentidadVoz, fuentes?: FuentesIdentidadVoz): IdentidadVoz {
    const defecto = identidadVozPorDefecto(ctx.personalidad ?? undefined);
    let mapa: FuentesIdentidadVoz = fuentes ? sanitizarFuentes(fuentes) : {};
    if (!fuentes && typeof window !== "undefined") {
        // Lo que la cuenta YA decidió sin tienda propia: el timbre fijado en Ajustes… Voz.
        const timbreFijado = limpiar(safeGet("starseed.voz.timbre.v1"));
        if (timbreFijado && buscarTimbre(timbreFijado)) mapa = { cuenta: { "*": { timbre: timbreFijado } } };
    }
    const resuelta = resolverIdentidadVoz(defecto, mapa, ctx);
    return { ...resuelta, instruct: instructDeTimbre(resuelta.timbre) ?? defecto.instruct };
}
