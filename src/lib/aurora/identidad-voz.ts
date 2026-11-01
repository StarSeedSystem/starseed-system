/**
 * RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (Ola 1015V · VZF1015M · 1/3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Los seis mapas de «qué voz tiene esta persona» (`VOZ_POR_PERSONA`, los pines
 * del registro, timbres/voz-inicial/voz-rito, el instruct del demonio,
 * `seedKindFor` y `xai-persona-voices`) se resuelven aquí con la precedencia
 * del contrato `architecture/voz-fusionada-astraura.md` §3:
 *     agente › personalidad › cerebro › neurona › cuenta
 * Cada capa aporta timbre, motor y voz rápida (`vozRT`). La primera capa
 * reconocida gana cada campo; las siguientes rellenan huecos y, al final,
 * mandan los valores de fábrica. `origen` dice qué capa decidió. Módulo HOJA y
 * PURO: sin red, disco, reloj ni micrófono; nunca lanza (Aurora · F1).
 */

import { TIMBRES, TIMBRE_PREDETERMINADO } from "@/lib/aurora/timbres-catalogo";
import { XAI_PERSONA_VOICES } from "@/lib/aurora/tts-oss/xai-persona-voices";
import { isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";
import type { VoiceGender } from "@/lib/aurora/personalities";

/** Capa que decidió la identidad; `defecto` cuando ninguna capa la reconoce. */
export type OrigenVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

/** Lo que una capa puede fijar. Todo opcional: lo que falta se hereda. */
export interface CapaVoz { timbre?: string; motor?: string; vozRT?: string }

/** Una capa es su id (se busca en los mapas) o un registro ya resuelto. */
export type ValorCapaVoz = string | CapaVoz;

/** Las cinco capas del contrato, de la más fuerte a la más débil. */
export interface EntradaIdentidadVoz {
    agente?: ValorCapaVoz;
    personalidad?: ValorCapaVoz;
    cerebro?: ValorCapaVoz;
    neurona?: ValorCapaVoz;
    cuenta?: ValorCapaVoz;
}

/** Identidad resuelta: timbre (quién), motor (la vía), vozRT (la charla) y origen. */
export interface IdentidadVoz { timbre: string; motor: string; vozRT: string; origen: OrigenVoz }

export const MOTOR_POR_DEFECTO = "openvoice2";
export const VOZ_RT_POR_DEFECTO = "F1";
export const TIMBRE_POR_DEFECTO = TIMBRE_PREDETERMINADO.femenina;

/**
 * Espejo de `VOZ_POR_PERSONA` de `voz-rt.ts` (el mapa original no se borra; la
 * parte de cableado lo hará leer desde aquí para que exista UNA sola tabla).
 */
const VOZ_RT_POR_ID: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
    mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};

const XAI = XAI_PERSONA_VOICES as Record<string, { gender: "f" | "m" }>;

/** Clave tolerante: minúsculas, sin tildes y con `_` en vez de espacios o guiones. */
function normalizar(valor: string): string {
    return (valor || "").trim().toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
}

/** Timbre del catálogo por id, nombre o sufijo (`hermes` → `masc-hermes`). */
function timbreDe(id: string): string | undefined {
    const clave = normalizar(id);
    if (!clave) return undefined;
    return TIMBRES.find((t) => normalizar(t.id) === clave)?.id
        ?? TIMBRES.find((t) => normalizar(t.nombre) === clave)?.id
        ?? TIMBRES.find((t) => normalizar(t.id).endsWith(`_${clave}`))?.id;
}
/** Género que ya declaran los mapas existentes (timbre, xAI o voz rápida). */
function generoDe(id: string, timbreId?: string): VoiceGender | undefined {
    const porTimbre = timbreId ? TIMBRES.find((x) => x.id === timbreId)?.genero : undefined;
    if (porTimbre) return porTimbre;
    const xai = XAI[id];
    if (xai) return xai.gender === "f" ? "femenina" : "masculina";
    const rt = VOZ_RT_POR_ID[id];
    return rt ? (rt.startsWith("M") ? "masculina" : "femenina") : undefined;
}
interface Parcial extends CapaVoz { reconocida?: boolean }
/** Resuelve UNA capa contra los mapas existentes. PURA. */
function resolverCapa(valor: ValorCapaVoz): Parcial {
    const registro: CapaVoz = typeof valor === "string" ? {} : valor ?? {};
    const crudo = typeof valor === "string" ? valor.trim().toLowerCase() : "";
    const id = crudo ? normalizar(crudo) : "";
    const timbre = (registro.timbre && timbreDe(registro.timbre)) || (id ? timbreDe(id) : undefined);
    const vozRT = registro.vozRT?.trim() || (id ? VOZ_RT_POR_ID[id] : undefined);
    const motor = registro.motor?.trim() || (isVoiceEngineId(crudo) ? crudo : undefined);
    const genero = id ? generoDe(id, timbre) : undefined;
    return { timbre: timbre ?? (genero ? TIMBRE_PREDETERMINADO[genero] : undefined), motor,
        vozRT: vozRT ?? (genero ? (genero === "masculina" ? "M1" : "F1") : undefined),
        reconocida: Boolean(timbre || motor || vozRT || genero) };
}
const CAPAS = ["agente", "personalidad", "cerebro", "neurona", "cuenta"] as const;

/** La identidad de voz de una persona (`agente › personalidad › cerebro › neurona › cuenta`). Nunca lanza. */
export function identidadVoz(entrada?: EntradaIdentidadVoz): IdentidadVoz {
    let timbre: string | undefined, motor: string | undefined, vozRT: string | undefined;
    let origen: OrigenVoz = "defecto";
    for (const capa of CAPAS) {
        const valor = (entrada ?? {})[capa];
        if (valor === undefined || valor === null) continue;
        const r = resolverCapa(valor);
        if (!r.reconocida) continue;
        if (origen === "defecto") origen = capa;
        timbre ??= r.timbre;
        motor ??= r.motor;
        vozRT ??= r.vozRT;
    }
    return { timbre: timbre ?? TIMBRE_POR_DEFECTO, motor: motor ?? MOTOR_POR_DEFECTO,
        vozRT: vozRT ?? VOZ_RT_POR_DEFECTO, origen };
}
