/**
 * IDENTIDAD DE VOZ DE ASTRAURA — un solo resolutor por persona (Ola 1015V · tarea M).
 * SOP: `architecture/voz-fusionada-astraura.md` §3 («Una sola identidad por persona»).
 * Alimenta los seis mapas de voz SIN borrar ninguno — el espejo de `VOZ_POR_PERSONA`
 * (voz-rt) y el timbre base autónomo (timbres.ts) son sus defectos; INSTRUCT del
 * demonio y semilla de openvoice2 siguen en `perfil-neuronal.ts` y `openvoice2.ts`.
 * Precedencia POR CAMPO (la capa más específica gana): agente › personalidad ›
 * cerebro › neurona › cuenta. Puro y SSR-safe: el store va inyectado al resolutor.
 */
import { safeGet } from "@/lib/safe-storage";
import { TIMBRE_AUTONOMO_BASE } from "@/lib/aurora/timbres-catalogo";

export const CLAVE_IDENTIDAD_VOZ = "starseed.aurora.identidad-voz.v1";
export const MOTOR_VOZ_RT_DEFECTO = "supertonic"; // el motor del turno: la voz en tiempo real
export const VOZ_RT_DEFECTO = "F1"; // la voz F1 de Alex: el defecto que conserva el resolutor

/** Mapa base de «voz rápida» por personalidad: espejo de `VOZ_POR_PERSONA` (voz-rt.ts). */
export const VOZ_RT_POR_PERSONA: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
    mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};

export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";
export interface EleccionIdentidadVoz { timbre?: string; motor?: string; vozRT?: string; }

export interface IdentidadVozStore {
    porCuenta?: Record<string, EleccionIdentidadVoz>; porNeurona?: Record<string, EleccionIdentidadVoz>;
    porCerebro?: Record<string, EleccionIdentidadVoz>; porAgente?: Record<string, EleccionIdentidadVoz>;
    porPersonalidad?: Record<string, EleccionIdentidadVoz>;
}

export interface ContextoIdentidadVoz {
    agente?: string | null; personalidad?: string | null; cerebro?: string | null;
    neurona?: string | null; cuenta?: string | null;
}

/** La identidad resuelta: timbre, motor, voz rápida y capa de la que salió. */
export interface IdentidadVozResuelta { timbre: string; motor: string; vozRT: string; origen: OrigenIdentidadVoz; }

/** Igual que `vozDePersona` de voz-rt.ts (minúsculas, espacios → «_»). */
function idPersona(v: unknown): string {
    return typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 160) : "";
}

export function vozRTDePersona(personaId?: string | null): string { return VOZ_RT_POR_PERSONA[idPersona(personaId)] || VOZ_RT_DEFECTO; }

function idPuro(v: unknown, max = 160): string | undefined {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s.length && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s) ? s : undefined;
}

export function sanitizeEleccionIdentidadVoz(v: unknown): EleccionIdentidadVoz | null {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const [timbre, motor, vozRT] = [idPuro(o.timbre), idPuro(o.motor, 80), idPuro(o.vozRT, 12)];
    const e: EleccionIdentidadVoz = {};
    if (timbre) e.timbre = timbre;
    if (motor) e.motor = motor;
    if (vozRT) e.vozRT = vozRT;
    return timbre || motor || vozRT ? e : null;
}

const ORDEN: { ambito: OrigenIdentidadVoz; mapa: keyof IdentidadVozStore; id: keyof ContextoIdentidadVoz }[] = [
    { ambito: "agente", mapa: "porAgente", id: "agente" },
    { ambito: "personalidad", mapa: "porPersonalidad", id: "personalidad" },
    { ambito: "cerebro", mapa: "porCerebro", id: "cerebro" },
    { ambito: "neurona", mapa: "porNeurona", id: "neurona" },
    { ambito: "cuenta", mapa: "porCuenta", id: "cuenta" },
];

/** El resolutor PURO: por campo gana la capa más específica que lo diga. */
export function identidadVozDe(
    store: IdentidadVozStore,
    ctx: ContextoIdentidadVoz,
    timbrePorDefecto: string = TIMBRE_AUTONOMO_BASE,
): IdentidadVozResuelta {
    const presentes = ORDEN.map((paso) => {
        const id = idPersona(ctx[paso.id]);
        return { paso, e: id ? (sanitizeEleccionIdentidadVoz(store[paso.mapa]?.[id]) ?? null) : null };
    });
    const campo = (c: keyof EleccionIdentidadVoz, defecto: string): string =>
        presentes.map((x) => x.e?.[c]).find(Boolean) ?? defecto;
    return {
        timbre: campo("timbre", timbrePorDefecto),
        motor: campo("motor", MOTOR_VOZ_RT_DEFECTO),
        vozRT: campo("vozRT", vozRTDePersona(ctx.personalidad)),
        origen: presentes.find((x) => x.e && (x.e.timbre || x.e.motor || x.e.vozRT))?.paso.ambito ?? "defecto",
    };
}

function sanitizeMapa(v: unknown): Record<string, EleccionIdentidadVoz> | undefined {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const out: Record<string, EleccionIdentidadVoz> = {};
    for (const [rawId, e] of Object.entries(v as Record<string, unknown>).slice(0, 300)) {
        const id = idPuro(rawId), c = sanitizeEleccionIdentidadVoz(e);
        if (id && c) out[id] = c;
    }
    return Object.keys(out).length ? out : undefined;
}

/** Lee el store guardado en la neurona. Nunca lanza; sin navegador, vacío. */
export function leerIdentidadVozStore(): IdentidadVozStore {
    try {
        const o = JSON.parse(safeGet(CLAVE_IDENTIDAD_VOZ) ?? "{}") as Record<string, unknown>;
        const out: IdentidadVozStore = {};
        for (const paso of ORDEN) {
            const m = sanitizeMapa(o[paso.mapa]);
            if (m) out[paso.mapa] = m;
        }
        return out;
    } catch {
        return {};
    }
}

/** La identidad de voz de una persona con el store REAL de la neurona. */
export function identidadVoz(ctx: ContextoIdentidadVoz): IdentidadVozResuelta {
    return identidadVozDe(leerIdentidadVozStore(), ctx);
}
