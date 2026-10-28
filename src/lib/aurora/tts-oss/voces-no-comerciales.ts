/**
 * StarSeed OS — Voces locales de USO PERSONAL NO COMERCIAL (VZR1011C · Ola 1011I).
 * F5-TTS (pesos CC-BY-NC) y XTTS-v2 (Coqui Public Model License) son OPCIONALES:
 * apagados por defecto, solo si la persona los instala y acepta su licencia en una
 * casilla que la explica. Nunca en contextos comerciales ni en la cadena AUTO por
 * defecto. ChatTTS (CC BY-NC 4.0 «solo académico», sin español) NO se integra:
 * aquí vive solo su ficha. Módulo PURO: el filtro comercial se prueba de entrada
 * a salida, sin red, disco, reloj ni audio. Regla de la forja §4: en el producto y
 * en todo uso comercial solo MIT/Apache.
 */

import type { ContextoLicenciaVoz } from "@/lib/aurora/voz-starseed/licencia-voz";

export type IdVozNoComercial = "f5-tts" | "xtts-v2" | "chattts";

export interface FichaVozNoComercial {
  id: IdVozNoComercial;
  nombre: string;
  autor: string;
  repo: string;
  repoGithub: string;
  licenciaCodigo: string;
  licenciaPesos: string;
  español: boolean;
  /** false = solo ficha en la Biblioteca, no se puede activar. */
  integrado: boolean;
  /** true = entra apagado por defecto y exige opt-in explícito. */
  opcionalPersonal: boolean;
  enAutoPorDefecto: false;
  nota: string;
}

/** Licencias EXACTAS del contrato `architecture/astraura-voces-y-robots.md` §1. */
export const FICHAS_VOCES_NO_COMERCIALES: readonly FichaVozNoComercial[] = [
  {
    id: "f5-tts", nombre: "F5-TTS · opcional personal", autor: "SWivid",
    repo: "https://github.com/SWivid/F5-TTS", repoGithub: "SWivid/F5-TTS",
    licenciaCodigo: "MIT", licenciaPesos: "CC-BY-NC", español: false,
    integrado: true, opcionalPersonal: true, enAutoPorDefecto: false,
    nota: "Flow matching sin fonemas; español no oficial (zh/en). Solo uso personal no comercial.",
  },
  {
    id: "xtts-v2", nombre: "XTTS-v2 · opcional personal", autor: "Coqui",
    repo: "https://github.com/coqui-ai/TTS", repoGithub: "coqui-ai/TTS",
    licenciaCodigo: "MPL-2.0", licenciaPesos: "Coqui Public Model License (no comercial)", español: true,
    integrado: true, opcionalPersonal: true, enAutoPorDefecto: false,
    nota: "Clonación en 16 idiomas con español. Coqui cerró: no hay licencia comercial, solo uso personal.",
  },
  {
    id: "chattts", nombre: "ChatTTS · solo ficha", autor: "2noise",
    repo: "https://github.com/2noise/ChatTTS", repoGithub: "2noise/ChatTTS",
    licenciaCodigo: "AGPLv3+", licenciaPesos: "CC BY-NC 4.0 (solo académico)", español: false,
    integrado: false, opcionalPersonal: false, enAutoPorDefecto: false,
    nota: "No se integra: modelo CC BY-NC 4.0 «solo académico» y sin español (solo inglés y chino).",
  },
];

export function fichaVozNoComercial(id: string): FichaVozNoComercial | null {
  return FICHAS_VOCES_NO_COMERCIALES.find((f) => f.id === id) ?? null;
}

export function esIdVozNoComercial(valor: unknown): valor is IdVozNoComercial {
  return valor === "f5-tts" || valor === "xtts-v2" || valor === "chattts";
}

export interface ConsentimientoVozNoComercial {
  instalado: boolean;
  licenciaAceptada: boolean;
}

/** Apagado de fábrica: ni instalado ni aceptado. */
export function consentimientoApagado(): ConsentimientoVozNoComercial {
  return { instalado: false, licenciaAceptada: false };
}

export interface DecisionVozNoComercial {
  permitido: boolean;
  motivo: string;
}

export const MOTIVO_DESCONOCIDO = "motor desconocido para el catálogo no comercial";
export const MOTIVO_SOLO_FICHA = "solo ficha: no está integrado en el OS";
export const MOTIVO_FUERA_DE_PERSONAL = "pesos no comerciales: solo uso personal";
export const MOTIVO_NO_INSTALADO = "no instalado: la descarga de pesos es manual y opcional";
export const MOTIVO_LICENCIA_NO_ACEPTADA = "licencia no aceptada en la casilla";
export const MOTIVO_PERMITIDO = "uso personal no comercial autorizado";

/**
 * Filtro comercial: un motor no comercial solo suena si está integrado, la
 * persona lo instaló, aceptó su licencia y el contexto es PERSONAL. Público,
 * grupo, comunidad y comercial quedan fuera siempre.
 */
export function decidirUsoVozNoComercial(
  id: string,
  consentimiento: ConsentimientoVozNoComercial,
  contexto: ContextoLicenciaVoz,
): DecisionVozNoComercial {
  const ficha = fichaVozNoComercial(id);
  if (!ficha) return { permitido: false, motivo: MOTIVO_DESCONOCIDO };
  if (!ficha.integrado) return { permitido: false, motivo: MOTIVO_SOLO_FICHA };
  if (contexto !== "personal") return { permitido: false, motivo: MOTIVO_FUERA_DE_PERSONAL };
  if (!consentimiento.instalado) return { permitido: false, motivo: MOTIVO_NO_INSTALADO };
  if (!consentimiento.licenciaAceptada) return { permitido: false, motivo: MOTIVO_LICENCIA_NO_ACEPTADA };
  return { permitido: true, motivo: MOTIVO_PERMITIDO };
}

/** Texto de la casilla que explica la licencia (null si el motor no se integra). */
export function textoAceptacionLicencia(id: string): string | null {
  const ficha = fichaVozNoComercial(id);
  if (!ficha || !ficha.integrado) return null;
  return `Acepto la licencia de ${ficha.nombre}: código ${ficha.licenciaCodigo}, pesos ${ficha.licenciaPesos}. Solo para uso personal no comercial: nunca en páginas, grupos, comunidades ni contextos comerciales.`;
}

/** La cadena AUTO por defecto nunca incluye motores no comerciales. */
export function vocesNoComercialesEnAuto(): readonly IdVozNoComercial[] {
  return [];
}
