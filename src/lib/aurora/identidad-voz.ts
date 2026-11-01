/**
 * IDENTIDAD DE VOZ POR PERSONA — un solo resolutor (Ola 1015V · VZF1015M).
 * ─────────────────────────────────────────────────────────────────────────────
 * Une los seis mapas de «qué voz tiene esta persona» (VOZ_POR_PERSONA de
 * voz-rt, pines del registro, timbres/voz-inicial/voz-rito, instruct del
 * demonio, seedKindFor de OpenVoice2 y XAI_PERSONA_VOICES) sin borrar ninguno.
 * Precedencia del contrato `architecture/voz-fusionada-astraura.md` §3:
 * agente › personalidad › cerebro › neurona › cuenta › defecto. Puro y no lanza.
 */

import type { VoiceGender } from "@/lib/aurora/personalities";
import { TIMBRES, TIMBRE_PREDETERMINADO, type Timbre } from "./timbres-catalogo";
import { isVoiceEngineId, type AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

/** Ámbito que aportó la identidad, del más fuerte al más débil. */
export type CapaVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

/** Lo que una capa sabe de su voz. Todo opcional: lo que falte se hereda. */
export interface FuenteIdentidadVoz {
  id?: string | null;
  timbre?: string | null;
  motor?: string | null;
  vozRT?: string | null;
  genero?: VoiceGender | null;
}

/** Una capa llega como objeto o como id suelto (atajo de `vozDePersona`). */
export type CapaIdentidadVoz = FuenteIdentidadVoz | string | null | undefined;

export interface EntradaIdentidadVoz {
  agente?: CapaIdentidadVoz;
  personalidad?: CapaIdentidadVoz;
  cerebro?: CapaIdentidadVoz;
  neurona?: CapaIdentidadVoz;
  cuenta?: CapaIdentidadVoz;
}

export interface IdentidadVoz {
  /** Receta completa de timbre (voz neuronal, velocidad, instruct, expresión). */
  timbre: Timbre;
  motor: AuroraVoiceEngine;
  vozRT: string;
  origen: CapaVoz;
}

/** Espejo de `VOZ_POR_PERSONA` de `voz-rt.ts`. La F1 de Alex es el suelo. */
export const VOZ_RT_POR_PERSONA: Readonly<Record<string, string>> = {
  aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
  mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};

/** Motor del pin real de la cadena y voz de conversación por defecto. */
export const MOTOR_IDENTIDAD_POR_DEFECTO: AuroraVoiceEngine = "openvoice2";
export const VOZ_RT_POR_DEFECTO = "F1";
const VOZ_RT_VALIDA = /^[FM][1-5]$/i;
const ORDEN_CAPAS: readonly CapaVoz[] = ["agente", "personalidad", "cerebro", "neurona", "cuenta"];

function normalizar(capa: CapaIdentidadVoz): FuenteIdentidadVoz {
  if (typeof capa === "string") return { id: capa };
  return capa && typeof capa === "object" ? capa : {};
}

function idConocido(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function motorValido(motor: string | null | undefined): AuroraVoiceEngine | null {
  const limpio = typeof motor === "string" ? motor.trim().toLowerCase() : "";
  return isVoiceEngineId(limpio) ? limpio : null;
}

function vozRTValida(voz: string | null | undefined): string | null {
  if (typeof voz !== "string") return null;
  const limpia = voz.trim().toUpperCase();
  return VOZ_RT_VALIDA.test(limpia) ? limpia : null;
}

function generoDeVozRT(vozRT: string): VoiceGender | null {
  return vozRT.startsWith("F") ? "femenina" : vozRT.startsWith("M") ? "masculina" : null;
}

function timbrePorDefecto(genero: VoiceGender | null, vozRT: string): Timbre {
  const porGenero = genero ?? generoDeVozRT(vozRT);
  const id = porGenero ? TIMBRE_PREDETERMINADO[porGenero] : TIMBRES[0]?.id;
  return TIMBRES.find((t) => t.id === id) ?? TIMBRES[0];
}

/**
 * Resuelve `{ timbre, motor, vozRT, origen }` con la precedencia agente ›
 * personalidad › cerebro › neurona › cuenta. Un valor desconocido en una capa
 * descarta solo ese campo: la identidad sigue heredando de la siguiente.
 */
export function identidadVoz(entrada: EntradaIdentidadVoz = {}): IdentidadVoz {
  let timbre: Timbre | null = null;
  let motor: AuroraVoiceEngine | null = null;
  let vozRT: string | null = null;
  let genero: VoiceGender | null = null;
  let origen: CapaVoz = "defecto";

  for (const capa of ORDEN_CAPAS) {
    const fuente = normalizar(entrada[capa]);
    const id = idConocido(fuente.id);
    const timbreFuente = TIMBRES.find((t) => t.id === fuente.timbre) ?? null;
    const motorFuente = motorValido(fuente.motor);
    const vozFuente = vozRTValida(fuente.vozRT) ?? vozRTValida(id ? VOZ_RT_POR_PERSONA[id] : undefined);

    if (fuente.genero && !genero) genero = fuente.genero;
    if (!timbre && timbreFuente) timbre = timbreFuente;
    if (!motor && motorFuente) motor = motorFuente;
    if (!vozRT && vozFuente) vozRT = vozFuente;
    if (origen === "defecto" && (timbreFuente || motorFuente || vozFuente)) origen = capa;
  }

  const vozFinal = vozRT ?? VOZ_RT_POR_DEFECTO;
  return {
    timbre: timbre ?? timbrePorDefecto(genero, vozFinal),
    motor: motor ?? MOTOR_IDENTIDAD_POR_DEFECTO,
    vozRT: vozFinal,
    origen,
  };
}
