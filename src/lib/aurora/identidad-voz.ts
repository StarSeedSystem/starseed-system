/**
 * IDENTIDAD ÚNICA DE VOZ POR PERSONA (Ola 1015V · VZF1015M).
 * Un solo resolutor: agente › personalidad › cerebro › neurona › cuenta. Lee los
 * mapas existentes sin borrarlos (VOZ_POR_PERSONA, pines del registro, timbres y
 * voz-inicial, INSTRUCT del demonio, seedKindFor y XAI_PERSONA_VOICES). Nunca
 * lanza («Aurora SIEMPRE habla»): ante cualquier fallo, la voz F1 de Alex.
 */

import { getOverrides } from "@/lib/astraura/neuron-persona-store";
import { TIMBRE_AUTONOMO_BASE, TIMBRE_FIJO_KEY, TIMBRE_PREDETERMINADO, buscarTimbre } from "@/lib/aurora/timbres";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { XAI_PERSONA_VOICES, isXaiPersonaId } from "@/lib/aurora/tts-oss/xai-persona-voices";
import { generoEfectivo, getModoVoz, type ModoVoz } from "@/lib/aurora/voz-inicial";
import { safeGet } from "@/lib/safe-storage";
export const VOZ_RT_FIJA_KEY = "starseed.voz-rt.voz";
export { TIMBRE_FIJO_KEY };
export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";
/** Lo que puede fijar cualquier ámbito; lo ausente hereda del siguiente. */
export interface EleccionIdentidadVoz { timbre?: string; motor?: string; vozRT?: string; instruct?: string; semilla?: string; xai?: string }
/** Cada ámbito puede llegar como id (pin del registro) o como elección explícita. */
export type CapaIdentidadVoz = string | EleccionIdentidadVoz | null | undefined;
export interface ContextoIdentidadVoz { agente?: CapaIdentidadVoz; personalidad?: CapaIdentidadVoz; cerebro?: CapaIdentidadVoz; neurona?: CapaIdentidadVoz; cuenta?: CapaIdentidadVoz }
export interface OpcionesIdentidadVoz {
    vozRTFija?: string | null;
    timbreFijo?: string | null;
    modoVoz?: ModoVoz;
    /** Mapa privado de voz-rt (`personalidad → F1…M4`); se pasa tal cual. */
    vozPorPersona?: Record<string, string>;
    motorPorPersona?: (personalidad: string | undefined) => string | null;
}
export interface IdentidadVoz extends EleccionIdentidadVoz { timbre: string; motor: string; vozRT: string; origen: OrigenIdentidadVoz }
/** Mapa canónico de la conversación en vivo. voz-rt conserva el suyo (no se borra). */
export const VOZ_RT_POR_PERSONA: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
    mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};
const CAMPOS: Array<keyof EleccionIdentidadVoz> = ["timbre", "motor", "vozRT", "instruct", "semilla", "xai"];
const VOZ_VALIDA = /^[FM][1-5]$/;
export function clavePersona(personaId?: string | null): string {
    return (personaId || "").trim().toLowerCase().replace(/\s+/g, "_");
}
function texto(valor: unknown, max = 120): string | undefined {
    const s = typeof valor === "string" ? valor.trim() : "";
    return s && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s) ? s : undefined; // eslint-disable-line no-control-regex
}
function vozValida(valor: unknown): string | undefined {
    const s = texto(valor, 4);
    return s && VOZ_VALIDA.test(s) ? s : undefined;
}
function validar(campo: keyof EleccionIdentidadVoz, valor: unknown): string | undefined {
    if (campo === "vozRT") return vozValida(valor);
    const s = texto(valor, campo === "instruct" ? 500 : 120);
    if (s && campo === "motor" && !/^[a-z0-9][a-z0-9_-]*$/i.test(s)) return undefined;
    return s;
}
function eleccionDe(capa: CapaIdentidadVoz): EleccionIdentidadVoz | undefined {
    return capa && typeof capa === "object" && !Array.isArray(capa) ? capa : undefined;
}
function timbrePorModo(modo: ModoVoz): string {
    return modo === "autonoma" ? TIMBRE_AUTONOMO_BASE : TIMBRE_PREDETERMINADO[generoEfectivo(modo)] ?? TIMBRE_PREDETERMINADO.femenina;
}
function motorDelRegistro(neurona: CapaIdentidadVoz, persona: CapaIdentidadVoz): string | undefined {
    const n = typeof neurona === "string" ? texto(neurona, 160) : undefined;
    const p = typeof persona === "string" ? texto(persona, 160) : undefined;
    if (!n || !p) return undefined;
    try { return texto(getOverrides(n, p).voz?.motor, 80); } catch { return undefined; }
}
/**
 * Resuelve `{ timbre, motor, vozRT, origen }`. Cada campo gana por separado en el
 * ámbito más específico que lo fija; los mapas completan lo que nadie fijó. Pura
 * salvo la lectura protegida de localStorage y del modo guardado; nunca lanza.
 */
export function identidadVoz(contexto: ContextoIdentidadVoz = {}, opciones: OpcionesIdentidadVoz = {}): IdentidadVoz {
    try {
        const persona = typeof contexto.personalidad === "string" ? texto(contexto.personalidad, 160) : undefined;
        const clave = clavePersona(persona);
        const fija = opciones.vozRTFija !== undefined ? vozValida(opciones.vozRTFija) : vozValida(safeGet(VOZ_RT_FIJA_KEY));
        const timbreFijo = opciones.timbreFijo !== undefined ? texto(opciones.timbreFijo, 120) : texto(safeGet(TIMBRE_FIJO_KEY), 120);
        const mapa = opciones.vozPorPersona ?? VOZ_RT_POR_PERSONA;
        const motor = texto(opciones.motorPorPersona?.(persona), 80)
            ?? motorDelRegistro(contexto.neurona, contexto.personalidad) ?? "auto";
        const salida: IdentidadVoz = {
            timbre: timbreFijo ?? timbrePorModo(opciones.modoVoz ?? getModoVoz()),
            motor,
            vozRT: fija ?? (VOZ_VALIDA.test(mapa[clave] ?? "") ? mapa[clave] : "F1"),
            origen: "defecto",
        };
        const capaPersona: EleccionIdentidadVoz = {
            ...(!fija && VOZ_VALIDA.test(mapa[clave] ?? "") ? { vozRT: mapa[clave] } : {}),
            ...(clave && isXaiPersonaId(clave) ? { xai: XAI_PERSONA_VOICES[clave].voice } : {}),
            ...(persona ? { semilla: seedKindFor(persona) ?? undefined } : {}),
            ...eleccionDe(contexto.personalidad),
        };
        const capas: Array<[OrigenIdentidadVoz, EleccionIdentidadVoz | undefined]> = [
            ["agente", eleccionDe(contexto.agente)],
            ["personalidad", capaPersona],
            ["cerebro", eleccionDe(contexto.cerebro)],
            ["neurona", eleccionDe(contexto.neurona)],
            ["cuenta", eleccionDe(contexto.cuenta)],
        ];
        const fijados = new Set<keyof EleccionIdentidadVoz>();
        for (const [origen, eleccion] of capas) {
            if (!eleccion) continue;
            let aporto = false;
            for (const campo of CAMPOS) {
                if (fijados.has(campo)) continue;
                const valor = validar(campo, eleccion[campo]);
                if (!valor) continue;
                salida[campo] = valor;
                fijados.add(campo);
                aporto = true;
            }
            if (aporto && salida.origen === "defecto") salida.origen = origen;
        }
        salida.instruct = salida.instruct ?? buscarTimbre(salida.timbre)?.local.instruct;
        return salida;
    } catch {
        return { timbre: TIMBRE_PREDETERMINADO.femenina, motor: "auto", vozRT: "F1", origen: "defecto" };
    }
}
