/**
 * RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (Ola 1015V · `architecture/voz-fusionada-astraura.md`
 * §3, regla 2 «Una sola identidad por persona»).
 * Había seis mapas de «qué voz tiene esta persona» sin coordinar: VOZ_POR_PERSONA
 * (voz-rt), los pines del registro de motores, los timbres de voz-inicial/voz-rito,
 * el INSTRUCT del demonio, seedKindFor de openvoice2 y xai-persona-voices. Este
 * módulo NO los borra: los LEE (se le pasan como `mapas`) y los somete a UNA
 * precedencia, la misma de Astraura 1.58 (`primary-system.ts`):
 *     agente › personalidad › cerebro › neurona › cuenta › defecto
 * con los mapas de persona resolviendo lo que las capas no fijaron, antes del
 * defecto: la voz F1 de Alex nunca se pierde por la división entre mapas.
 * PURO: sin `window`, sin red, sin disco; todo lo variable entra por parámetro.
 */

/** Un pin de voz tal como lo guardan las ventanas: timbre, motor y voz rápida. */
export interface CapaIdentidadVoz {
    /** Timbre del catálogo (voz-inicial/voz-rito) o la semilla de openvoice2. */
    timbre?: string;
    /** Motor de síntesis: supertonic · omnivoice · kokoro · xai… */
    motor?: string;
    /** Voz rápida de la conversación en vivo (F1–F5 · M1–M4, Supertonic). */
    vozRT?: string;
}

export interface EntradaIdentidadVoz {
    /** `personaId` opcional: activa los mapas de persona (voz-rt etc.). */
    personaId?: string;
    agente?: CapaIdentidadVoz;
    personalidad?: CapaIdentidadVoz;
    cerebro?: CapaIdentidadVoz;
    neurona?: CapaIdentidadVoz;
    cuenta?: CapaIdentidadVoz;
}

export type OrigenIdentidadVoz = "defecto" | "cuenta" | "neurona" | "cerebro" | "personalidad" | "agente" | "persona";
export type ClaveCapa = Exclude<OrigenIdentidadVoz, "defecto" | "persona">;

/** Precedencia: la misma de Astraura 1.58 — lo más cercano a la conversación manda. */
export const ORDEN_CAPAS: readonly ClaveCapa[] = ["agente", "personalidad", "cerebro", "neurona", "cuenta"];

/** Los seis mapas existentes, tal como están (nada se borra): quien llame pasa los que tenga a mano. */
export interface MapasIdentidadVoz {
    vozRT?: Record<string, string>;
    timbre?: Record<string, string>;
    semilla?: Record<string, string>;
    motor?: Record<string, string>;
    instruct?: Record<string, string>;
}

/** El resultado único: lo que cualquier capa de voz debe pedir a este resolutor. */
export interface IdentidadVoz {
    timbre: string | null;
    motor: string;
    vozRT: string;
    /** De qué capa (o mapa de persona, o defecto) salió el valor dominante. */
    origen: OrigenIdentidadVoz;
}

/** La voz en tiempo real de Alex (Supertonic), preservada aunque nadie configure nada. */
export const VOZ_RT_DEFECTO = "F1";
/** El motor de la conversación en vivo en esta neurona. */
export const MOTOR_DEFECTO = "supertonic";

const CAMPOS: readonly (keyof CapaIdentidadVoz)[] = ["timbre", "motor", "vozRT"];

/** El id de persona tal como aparece como clave en los mapas: minúsculas y `_`. */
function normalizar(id?: string): string {
    return (id || "").toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Cada campo sale de la capa MÁS ALTA que lo fijó (una capa que no fija un
 * campo no bloquea a las inferiores); `origen` es la capa dominante (la más alta
 * que fijó algo). Si ninguna capa fijó nada, los mapas de la persona dan lo suyo
 * con origen «persona»; si ni eso, la voz F1 de Alex queda preservada.
 */
export function identidadVoz(
    entrada: EntradaIdentidadVoz = {},
    mapas: MapasIdentidadVoz = {},
): IdentidadVoz {
    const resuelto: Record<"timbre" | "motor" | "vozRT", string | null> = { timbre: null, motor: null, vozRT: null };
    let origen: OrigenIdentidadVoz = "defecto";
    for (const capa of ORDEN_CAPAS) {
        const pin = entrada[capa];
        if (!pin) continue;
        let aportó = false;
        for (const campo of CAMPOS) {
            const valor = pin[campo];
            if (valor && !resuelto[campo]) {
                resuelto[campo] = valor;
                aportó = true;
            }
        }
        if (aportó && origen === "defecto") origen = capa;
    }
    const personaId = normalizar(entrada.personaId);
    const porPersona = (mapa: Record<string, string> | undefined): string | null =>
        mapa && personaId ? (mapa[personaId] ?? null) : null;
    resuelto.vozRT = resuelto.vozRT ?? porPersona(mapas.vozRT);
    resuelto.timbre = resuelto.timbre ?? (porPersona(mapas.timbre) ?? porPersona(mapas.semilla));
    resuelto.motor = resuelto.motor ?? porPersona(mapas.motor);
    if (origen === "defecto" && (resuelto.vozRT !== null || resuelto.timbre !== null || resuelto.motor !== null)) {
        origen = "persona";
    }
    return { timbre: resuelto.timbre, motor: resuelto.motor ?? MOTOR_DEFECTO, vozRT: resuelto.vozRT ?? VOZ_RT_DEFECTO, origen };
}

/** Texto para la interfaz («Fijado por el agente», «Defecto del OS»…). */
export function describeOrigen(origen: OrigenIdentidadVoz): string {
    switch (origen) {
        case "agente": return "Fijado por el agente";
        case "personalidad": return "Fijado por la personalidad";
        case "cerebro": return "Fijado por el cerebro";
        case "neurona": return "Fijado en esta neurona";
        case "cuenta": return "Fijado en la cuenta";
        case "persona": return "Voz reconocida de esta persona";
        default: return "Defecto del OS (voz F1)";
    }
}
