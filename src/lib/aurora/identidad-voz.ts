/**
 * IDENTIDAD ÚNICA DE VOZ POR PERSONA (Ola 1015V · VZF1015M · parte 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo resolutor para los seis mapas sin coordinar: VOZ_POR_PERSONA de
 * `voz-rt.ts` (inyectado, sin copiarlo), pines del registro (`motorPorPersona`),
 * `TIMBRES`/`TIMBRE_PREDETERMINADO` con el modo de `voz-inicial.ts`, el INSTRUCT
 * del demonio, `seedKindFor` de OpenVoice2 y `XAI_PERSONA_VOICES`.
 *
 * Precedencia: agente › personalidad › cerebro › neurona › cuenta. Cada campo se
 * resuelve por separado; lo que nadie fija cae al suelo: la voz F1 de Alex, el
 * timbre del modo y el motor «auto». Nunca lanza («Aurora SIEMPRE habla»).
 */

import { safeGet } from "@/lib/safe-storage";
import { TIMBRE_AUTONOMO_BASE, TIMBRE_PREDETERMINADO, TIMBRES } from "@/lib/aurora/timbres-catalogo";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { XAI_PERSONA_VOICES, isXaiPersonaId } from "@/lib/aurora/tts-oss/xai-persona-voices";
import { generoEfectivo, getModoVoz, type ModoVoz } from "@/lib/aurora/voz-inicial";
/** Claves compartidas con `voz-rt.ts` y `timbres.ts` (los mapas no se mueven). */
export const VOZ_RT_FIJA_KEY = "starseed.voz-rt.voz";
export const TIMBRE_FIJO_KEY = "starseed.voz.timbre.v1";
export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";
/** Lo que cualquier ámbito puede fijar; lo ausente hereda del siguiente. */
export interface EleccionIdentidadVoz { timbre?: string; motor?: string; vozRT?: string; instruct?: string; semilla?: string; xai?: string }
/** Un ámbito llega como elección explícita; en «personalidad» también como id. */
export type CapaIdentidadVoz = string | EleccionIdentidadVoz | null | undefined;
export interface ContextoIdentidadVoz { agente?: CapaIdentidadVoz; personalidad?: CapaIdentidadVoz; personalidadId?: string; cerebro?: CapaIdentidadVoz; neurona?: CapaIdentidadVoz; cuenta?: CapaIdentidadVoz }
/** Mapas vivos que el llamador inyecta para que este módulo no los duplique. */
export interface OpcionesIdentidadVoz {
    vozPorPersona?: Record<string, string>; xaiPorPersona?: Record<string, string>;
    semillaPorPersona?: (persona?: string) => string | null; motorPorPersona?: (persona?: string) => string | null;
    modoVoz?: ModoVoz; vozRTFija?: string | null; timbreFijo?: string | null;
}
export interface IdentidadVoz extends EleccionIdentidadVoz { timbre: string; motor: string; vozRT: string; origen: OrigenIdentidadVoz }
/** Espejo canónico de la conversación en vivo; `voz-rt` conserva el suyo. */
export const VOZ_RT_POR_PERSONA: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
    mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};
/** Misma llave que `vozDePersona`: minúsculas y espacios → guion bajo. */
export function clavePersona(personaId?: string | null): string {
    return (personaId || "").trim().toLowerCase().replace(/\s+/g, "_");
}
type Campo = keyof EleccionIdentidadVoz;
const CAMPOS: Campo[] = ["timbre", "motor", "vozRT", "instruct", "semilla", "xai"];
const VOZ_VALIDA = /^[FM][1-5]$/;
function texto(valor: unknown, max = 120): string | undefined {
    const s = typeof valor === "string" ? valor.trim() : "";
    return s && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s) ? s : undefined; // eslint-disable-line no-control-regex
}
function vozValida(valor: unknown): string | undefined {
    const s = texto(valor, 4);
    return s && VOZ_VALIDA.test(s) ? s : undefined;
}
function validar(campo: Campo, valor: unknown): string | undefined {
    if (campo === "vozRT") return vozValida(valor);
    const s = texto(valor, campo === "instruct" ? 500 : 120);
    return s && campo === "motor" && !/^[a-z0-9][a-z0-9_-]*$/i.test(s) ? undefined : s;
}
function eleccionDe(capa: CapaIdentidadVoz): EleccionIdentidadVoz | undefined {
    return capa && typeof capa === "object" && !Array.isArray(capa) ? capa : undefined;
}
function timbrePorModo(modo: ModoVoz): string {
    return modo === "autonoma" ? TIMBRE_AUTONOMO_BASE : TIMBRE_PREDETERMINADO[generoEfectivo(modo)] ?? TIMBRE_PREDETERMINADO.femenina;
}
/**
 * Resuelve `{ timbre, motor, vozRT, origen }`. Cada campo gana por separado en el
 * ámbito más específico que lo fija; los mapas completan lo que nadie fijó.
 * Pura salvo la lectura protegida de localStorage; nunca lanza.
 */
export function identidadVoz(contexto: ContextoIdentidadVoz & OpcionesIdentidadVoz = {}, opciones: OpcionesIdentidadVoz = {}): IdentidadVoz {
    const cfg: OpcionesIdentidadVoz = { ...contexto, ...opciones };
    try {
        const modo = cfg.modoVoz ?? getModoVoz();
        const fija = cfg.vozRTFija !== undefined ? vozValida(cfg.vozRTFija) : vozValida(safeGet(VOZ_RT_FIJA_KEY));
        const timbreFijo = cfg.timbreFijo !== undefined ? texto(cfg.timbreFijo) : texto(safeGet(TIMBRE_FIJO_KEY));
        const persona = typeof contexto.personalidad === "string" ? texto(contexto.personalidad, 160) : texto(contexto.personalidadId, 160);
        const clave = clavePersona(persona);
        const mapa = cfg.vozPorPersona ?? VOZ_RT_POR_PERSONA;
        const salida: IdentidadVoz = {
            timbre: timbreFijo ?? timbrePorModo(modo), motor: "auto", origen: "cuenta",
            vozRT: fija ?? (VOZ_VALIDA.test(mapa[clave] ?? "") ? mapa[clave] : "F1"),
        };
        const capaPersonalidad: EleccionIdentidadVoz = { ...eleccionDe(contexto.personalidad) };
        if (clave) {
            if (!fija && VOZ_VALIDA.test(mapa[clave] ?? "")) capaPersonalidad.vozRT = mapa[clave];
            const semilla = cfg.semillaPorPersona ? cfg.semillaPorPersona(persona) : seedKindFor(persona);
            if (semilla) capaPersonalidad.semilla = semilla;
            const xai = cfg.xaiPorPersona?.[clave] ?? (isXaiPersonaId(clave) ? XAI_PERSONA_VOICES[clave].voice : undefined);
            if (xai) capaPersonalidad.xai = xai;
            const motor = cfg.motorPorPersona?.(persona);
            if (motor) capaPersonalidad.motor = motor;
        }
        const capas: Array<[OrigenIdentidadVoz, EleccionIdentidadVoz | undefined]> = [
            ["agente", eleccionDe(contexto.agente)], ["personalidad", capaPersonalidad],
            ["cerebro", eleccionDe(contexto.cerebro)], ["neurona", eleccionDe(contexto.neurona)],
            ["cuenta", eleccionDe(contexto.cuenta)],
        ];
        const fijados = new Set<Campo>();
        let primerOrigen: OrigenIdentidadVoz | null = null;
        for (const [origen, capa] of capas) {
            if (!capa) continue;
            let aporto = false;
            for (const campo of CAMPOS) {
                if (fijados.has(campo)) continue;
                const valor = validar(campo, capa[campo]);
                if (!valor) continue;
                (salida as unknown as Record<string, string>)[campo] = valor;
                fijados.add(campo);
                aporto = true;
            }
            if (aporto) primerOrigen ??= origen;
        }
        salida.origen = primerOrigen ?? "cuenta";
        salida.instruct = salida.instruct ?? TIMBRES.find((t) => t.id === salida.timbre)?.local.instruct;
        return salida;
    } catch {
        return { timbre: TIMBRE_PREDETERMINADO.femenina, motor: "auto", vozRT: "F1", origen: "defecto" };
    }
}
