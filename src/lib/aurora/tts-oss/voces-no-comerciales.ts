"use client";

/**
 * voces-no-comerciales.ts — LICENCIAS DE VOZ Y OPCIONALES DE USO PERSONAL.
 * Contrato: `architecture/astraura-voces-y-robots.md` §1 y forja-voz-158 §4.
 * Los datos de licencias son los VERIFICADOS el 2026-10-11: no se inventa ninguno.
 *
 * Reglas que este módulo hace cumplir (funciones puras, sin red ni disco):
 *   · En producto y en uso comercial solo MIT/Apache.
 *   · F5-TTS (pesos CC-BY-NC) y XTTS-v2 (Coqui Public Model License) son
 *     OPCIONALES de uso personal no comercial: apagados, fuera de la cadena AUTO
 *     y solo si la persona los instala a mano y acepta su licencia.
 *   · Nunca en páginas ni grupos con fines comerciales.
 *   · ChatTTS (CC BY-NC 4.0 «solo académico», sin español) NO se integra: solo ficha.
 *   · Chatterbox y OpenVoice V2 son MIT y sí valen para comercio.
 *
 * `engine-registry.ts` no importa este módulo: la cadena AUTO por defecto sigue
 * intacta y estos motores no entran en ella. El filtro se aplica al elegir motor.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export type IdVozBiblioteca = "chatterbox" | "openvoice2" | "f5-tts" | "xtts-v2" | "chattts";
export type ContextoUso = "personal" | "comercial";

export interface FichaVozLicencia {
  id: IdVozBiblioteca;
  nombre: string;
  repo: string;
  licenciaCodigo: string;
  licenciaPesos: string;
  /** ¿Vale para el producto y para contextos comerciales? */
  comercial: boolean;
  /** ¿Entra como motor opcional de uso personal? (solo F5-TTS y XTTS-v2). */
  opcionalPersonal: boolean;
  /** Apagado por defecto y fuera de la cadena AUTO. */
  porDefecto: boolean;
  espanol: boolean;
  nota: string;
}

export interface EstadoVozOpcional {
  contexto: ContextoUso | string;
  instalada: boolean;
  licenciaAceptada: boolean;
}

export interface VeredictoUso {
  permitido: boolean;
  motivo: string | null;
}

/** Clave de localStorage del registro de instalación y aceptación. */
export const CLAVE_VOCES_OPCIONALES = "starseed.voz.no-comercial.v1";

function ficha(
  id: IdVozBiblioteca, nombre: string, repo: string, licenciaCodigo: string, licenciaPesos: string,
  comercial: boolean, opcionalPersonal: boolean, espanol: boolean, nota: string,
): FichaVozLicencia {
  return { id, nombre, repo, licenciaCodigo, licenciaPesos, comercial, opcionalPersonal, porDefecto: false, espanol, nota };
}

export const VOCES_LICENCIAS: readonly FichaVozLicencia[] = [
  ficha("chatterbox", "Chatterbox", "https://github.com/resemble-ai/chatterbox", "MIT", "MIT", true, false, true,
    "MIT con uso comercial libre; Multilingual V3 habla español y todo lo generado lleva la marca de agua Perth."),
  ficha("openvoice2", "OpenVoice V2", "https://github.com/myshell-ai/OpenVoice", "MIT", "MIT", true, false, true,
    "MIT, uso comercial libre según su README; ya es el motor principal. El «CC-BY-NC» que figuraba antes era un error."),
  ficha("f5-tts", "F5-TTS", "https://github.com/SWivid/F5-TTS", "MIT", "CC-BY-NC", false, true, false,
    "Código MIT, pesos CC-BY-NC: solo uso personal no comercial, nunca en producto. Sin español oficial (chino e inglés)."),
  ficha("xtts-v2", "XTTS-v2", "https://github.com/coqui-ai/TTS", "MPL-2.0", "Coqui Public Model License", false, true, true,
    "Modelo con la Coqui Public Model License, que prohíbe el uso comercial; Coqui cerró y no hay licencia que comprar. Habla 16 idiomas, español incluido."),
  ficha("chattts", "ChatTTS", "https://github.com/2noise/ChatTTS", "AGPL-3.0", "CC BY-NC 4.0 (solo académico)", false, false, false,
    "No se integra: modelo CC BY-NC 4.0 «solo académico», ruido a propósito y sin español (solo inglés y chino). Queda su ficha."),
];

export function buscarFichaVoz(id: string): FichaVozLicencia | null {
  return VOCES_LICENCIAS.find((v) => v.id === id) ?? null;
}

/** ¿Sus pesos impiden el uso comercial? (ChatTTS incluido: tampoco vale). */
export function esMotorNoComercial(id: string): boolean {
  return buscarFichaVoz(id)?.comercial === false;
}

/** Los únicos motores opcionales de uso personal: F5-TTS y XTTS-v2, apagados. */
export function motoresOpcionalesPersonales(): FichaVozLicencia[] {
  return VOCES_LICENCIAS.filter((v) => v.opcionalPersonal && !v.comercial);
}

const CONTEXTOS_COMERCIALES = new Set([
  "comercial", "empresa", "negocio", "grupo-comercial", "pagina-comercial", "publico-con-fines-comerciales",
]);

/** Contextos con fines comerciales: páginas, grupos, empresa o producto. */
export function esUsoComercial(contexto?: string): boolean {
  const limpio = (contexto ?? "").trim().toLowerCase();
  return limpio !== "" && CONTEXTOS_COMERCIALES.has(limpio);
}

/**
 * ¿Puede sonar este motor AHORA? Primero la licencia del contexto (manda sobre
 * todo), después que la persona lo haya instalado a mano y aceptado su licencia.
 */
export function puedeUsarVozOpcional(id: string, estado: EstadoVozOpcional): VeredictoUso {
  const f = buscarFichaVoz(id);
  if (!f) return { permitido: false, motivo: "Motor de voz desconocido." };
  if (f.comercial) return { permitido: true, motivo: null };
  if (!f.opcionalPersonal) {
    return { permitido: false, motivo: `${f.nombre} no se integra: solo queda su ficha en la Biblioteca.` };
  }
  if (esUsoComercial(estado.contexto)) {
    return { permitido: false, motivo: `${f.nombre} no se permite en páginas ni grupos con fines comerciales: sus pesos son ${f.licenciaPesos}.` };
  }
  if (!estado.instalada) {
    return { permitido: false, motivo: `${f.nombre} está apagado por defecto: instálalo a mano en esta neurona.` };
  }
  if (!estado.licenciaAceptada) {
    return { permitido: false, motivo: `Falta aceptar la licencia ${f.licenciaPesos} de ${f.nombre}.` };
  }
  return { permitido: true, motivo: null };
}

/**
 * Quita de una cadena de motores todo lo que no puede sonar en ese contexto.
 * En uso comercial caen F5-TTS, XTTS-v2 y ChatTTS; en uso personal no se toca nada.
 */
export function filtrarCadenaPorUso(cadena: readonly string[], contexto: ContextoUso | string): string[] {
  if (!esUsoComercial(contexto)) return [...cadena];
  return cadena.filter((id) => !esMotorNoComercial(id));
}

/** Texto de la casilla que explica la licencia antes de aceptarla. */
export function textoCasillaLicencia(id: string): string {
  const f = buscarFichaVoz(id);
  if (!f || f.comercial) return "";
  return `Acepto la licencia de ${f.nombre}: código ${f.licenciaCodigo} y pesos ${f.licenciaPesos}. ` +
    "Es solo para uso personal no comercial: no puedo usarlo en páginas ni grupos con fines comerciales.";
}

interface RegistroVozOpcional {
  instaladas?: Record<string, number>;
  aceptadas?: Record<string, string>;
}

function leerRegistro(): RegistroVozOpcional {
  try {
    const crudo = safeGet(CLAVE_VOCES_OPCIONALES);
    const json = crudo ? (JSON.parse(crudo) as RegistroVozOpcional | null) : null;
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function escribirRegistro(registro: RegistroVozOpcional): void {
  try {
    safeSet(CLAVE_VOCES_OPCIONALES, JSON.stringify(registro));
  } catch {
    /* sin almacenamiento: la voz sigue apagada, que es el lado seguro */
  }
}

/** Estado guardado: instalado a mano y licencia aceptada explícitamente. */
export function estadoVozOpcional(id: string): { instalada: boolean; licenciaAceptada: boolean } {
  const r = leerRegistro();
  return { instalada: typeof r.instaladas?.[id] === "number", licenciaAceptada: typeof r.aceptadas?.[id] === "string" };
}

/** Marca que la persona instaló el motor a mano (nunca descarga pesos solo). */
export function marcarVozInstalada(id: string, instalada = true): void {
  if (!buscarFichaVoz(id)?.opcionalPersonal) return;
  const r = leerRegistro();
  const instaladas = { ...(r.instaladas ?? {}) };
  if (instalada) instaladas[id] = Date.now();
  else delete instaladas[id];
  escribirRegistro({ ...r, instaladas });
}

/** Registra la aceptación EXPLÍCITA de la licencia (la casilla que la explica). */
export function registrarAceptacionLicencia(id: string): void {
  const f = buscarFichaVoz(id);
  if (!f?.opcionalPersonal) return;
  const r = leerRegistro();
  escribirRegistro({ ...r, aceptadas: { ...(r.aceptadas ?? {}), [id]: `${f.licenciaPesos} · ${new Date().toISOString()}` } });
}
