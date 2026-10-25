/**
 * IDENTIDAD DE VOZ · un solo resolutor por persona (Ola 1015V · tarea M).
 * Contrato: architecture/voz-fusionada-astraura.md §3, regla 2: una única
 * identidad por persona, resuelta por agente › personalidad › cerebro ›
 * neurona › cuenta, que alimenta a vozDePersona, timbreEfectivo y el pin del
 * registro. NO sustituye a los mapas existentes (VOZ_POR_PERSONA de voz-rt, el
 * pin del registro, los timbres, el INSTRUCT del demonio, seedKindFor de
 * openvoice2 y XAI_PERSONA_VOICES): cada capa entra aquí con lo que SU mapa
 * fijó, parcial o vacío, y esta función los funde. PURO e inyectable (sin
 * window, red ni procesos) y nunca lanza.
 */export type OrigenVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";
export interface VozXai { voz: string; instrucciones?: string } // voz e instrucciones del agente de xAI
export interface CapaVoz {
    timbre?: string; // receta de timbres.ts (su INSTRUCT va dentro)
    motor?: string; // pin del registro (engine-registry)
    vozRT?: string; // voz rápida F1…M5 (mapa de voz-rt)
    instruct?: string; // INSTRUCT del demonio OmniVoice
    seed?: string; // semilla curada de OpenVoice2 (seedKindFor)
    xai?: VozXai; // voz + instrucciones del agente de xAI
}
export interface ContextoIdentidadVoz { // capa → lo que su mapa fijó (o null)
    agente?: CapaVoz | null;
    personalidad?: CapaVoz | null;
    cerebro?: CapaVoz | null;
    neurona?: CapaVoz | null;
    cuenta?: CapaVoz | null;
}
export interface IdentidadVoz { // el paquete único de la persona
    timbre: string | null;
    motor: string | null;
    vozRT: string;
    instruct: string | null;
    seed: string | null;
    xai: VozXai | null;
    origen: OrigenVoz; // la capa más específica que fijó algo («defecto» si nadie)
}
export const DEFECTO_VOZ_RT = "F1";
const PATRON_VOZ_RT = /^[FM][1-5]$/;
const ORDEN_CAPAS = ["agente", "personalidad", "cerebro", "neurona", "cuenta"] as const;
/** Etiquetas legibles (para chips, fichas y Ajustes › Voz), en español. */
export const ETIQUETA_ORIGEN_VOZ: Record<OrigenVoz, string> = {
    agente: "Fijado por el agente",
    personalidad: "Fijado por la personalidad",
    cerebro: "Fijado por el cerebro",
    neurona: "Fijado por esta neurona",
    cuenta: "Ajuste de la cuenta",
    defecto: "Defecto del OS (F1)",
};
/** Un texto seguro y acotado, o `undefined`. Nunca lanza. */
function texto(v: unknown, max: number): string | undefined {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    if (!s || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) return undefined;
    return s;
}

/** Limpia una capa: campos validados, inválidos descartados, vacía → `null`. */
export function limpiarCapaVoz(capa: unknown): CapaVoz | null {
    if (!capa || typeof capa !== "object" || Array.isArray(capa)) return null;
    const o = capa as Record<string, unknown>;
    const out: CapaVoz = {
        timbre: texto(o.timbre, 160),
        motor: texto(o.motor, 60),
        instruct: texto(o.instruct, 300),
        seed: texto(o.seed, 60),
    };
    const voz = texto(o.vozRT, 4);
    if (voz && PATRON_VOZ_RT.test(voz)) out.vozRT = voz;
    if (o.xai && typeof o.xai === "object" && !Array.isArray(o.xai)) {
        const x = o.xai as Record<string, unknown>;
        const vozXai = texto(x.voz, 100);
        if (vozXai) {
            const instrucciones = texto(x.instrucciones, 4000);
            out.xai = instrucciones ? { voz: vozXai, instrucciones } : { voz: vozXai };
        }
    }
    return Object.values(out).some((v) => v !== undefined) ? out : null;
}

/** Funde las capas por precedencia: agente › personalidad › cerebro › neurona
 * › cuenta › defecto. La capa más específica que fija algo marca `origen`; los
 * campos que no fija los toma de la siguiente capa, y el defecto es la voz
 * rápida F1. Nunca lanza: lo vacío sale `null`, salvo vozRT, que trae voz. */
export function identidadVoz(ctx: ContextoIdentidadVoz): IdentidadVoz {
    const id: IdentidadVoz = {
        timbre: null,
        motor: null,
        vozRT: DEFECTO_VOZ_RT,
        instruct: null,
        seed: null,
        xai: null,
        origen: "defecto",
    };
    const fijado: Record<string, boolean> = {};
    try {
        for (const capa of ORDEN_CAPAS) {
            const limpia = limpiarCapaVoz(ctx[capa]);
            if (!limpia) continue;
            if (id.origen === "defecto") id.origen = capa;
            // La primera capa que fija un campo manda; las siguientes solo rellenan.
            const toma = (k: "timbre" | "motor" | "instruct" | "seed") => {
                const v = limpia[k];
                if (v !== undefined && !fijado[k]) {
                    fijado[k] = true;
                    (id[k] as string | null) = v;
                }
            };
            toma("timbre");
            toma("motor");
            toma("instruct");
            toma("seed");
            if (limpia.vozRT !== undefined && !fijado.vozRT) { fijado.vozRT = true; id.vozRT = limpia.vozRT; }
            if (limpia.xai !== undefined && !fijado.xai) { fijado.xai = true; id.xai = limpia.xai; }
        }
    } catch {
        /* una capa rota nunca deja a la persona sin voz */
    }
    return id;
}
