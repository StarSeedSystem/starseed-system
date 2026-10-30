/**
 * servidor-voz-sesion.ts — elección del servidor de voz de una sesión de malla
 * (VZF1015S · Ola 1015V · tarea S). Contrato: architecture/voz-fusionada-astraura.md §5.
 * Para cada sesión (tú solo, tu grupo o una llamada) elige la neurona que mejor OYE y la
 * que mejor HABLA con lo MEDIDO en sus fichas: menor coste de voz, RAM libre suficiente,
 * viva (latido < 2 min) y de confianza (tus neuronas o las de los miembros de la sesión).
 * Histéresis: solo cambia si la nueva es un 30 % mejor o la anterior dejó de latir
 * (relevo solo). Módulo PURO: reloj y fichas inyectadas; nunca lanza, sin candidato
 * devuelve solo `motivo`.
 */
import type { VozNodo } from "./capacidades-nodo";

/** Viva: latido menor de 2 min. Histéresis: la nueva debe superar un 30 % a la actual. */
export const LATIDO_MAX_MS = 2 * 60 * 1000;
export const MEJORA_MINIMA = 0.3;
/** RAM libre mínima (Phonon-2 = 164 MB, más colchón). Sin dato no se descarta nadie. */
export const RAM_MINIMA_MB = 512;

export type TipoSesionVoz = "propia" | "grupo" | "llamada";
export const TIPOS_SESION: readonly TipoSesionVoz[] = ["propia", "grupo", "llamada"];

/** La sesión que pide servidor: tú solo, tu grupo o una llamada grupal. */
export interface SesionVoz { miembros: string[]; tipo: TipoSesionVoz }

/**
 * Ficha de una neurona candidata (lo medido del §5, nunca declarado; sin voz medida no
 * puede servir ese papel). `mia`: ¿una de tus neuronas? Las demás solo cuentan si son
 * de un miembro de la sesión. `a1`: el Oracle A1 (24/7), un servidor más cuando está.
 */
export interface FichaServidorVoz {
  neurona: string;
  voz?: VozNodo;
  /** Latencia MEDIDA hasta esta neurona (ms); desempate del coste de voz. */
  latenciaMs?: number;
  /** Último latido (ms de época). */
  latido: number;
  ramLibreMb?: number;
  mia?: boolean;
  a1?: boolean;
}

export interface PeticionServidorVoz {
  sesion: SesionVoz;
  fichas: FichaServidorVoz[];
  /** Reloj inyectado (ms de época). */
  ahora: number;
  /** Servidor elegido antes: id por papel; undefined = primera elección. */
  actual?: { oido?: string; habla?: string };
}

export interface EleccionServidorVoz { oido?: string; habla?: string; motivo: string }

type Papel = "oido" | "habla";
/** Candidata a un papel: de confianza (§5), viva, con RAM y con coste medido. */
const esCandidata = (f: FichaServidorVoz | undefined, papel: Papel, miembros: Set<string>, ahora: number): boolean =>
  typeof f?.neurona === "string" && f.neurona !== "" && (f.mia === true || miembros.has(f.neurona))
  && typeof f.latido === "number" && ahora >= f.latido && ahora - f.latido < LATIDO_MAX_MS
  && (typeof f.ramLibreMb !== "number" || f.ramLibreMb >= RAM_MINIMA_MB)
  && coste(f, papel) < Infinity;

/** Menor valor medido de una lista de fichas de voz; vacía o sin números → Infinity. */
function menorMedido<T extends { motor: string }>(lista: T[] | undefined, valor: (x: T) => number): number {
  const mejor = Array.isArray(lista) && lista.length > 0 ? Math.min(...lista.map(valor)) : Infinity;
  return Number.isFinite(mejor) && mejor > 0 ? mejor : Infinity;
}

/** Coste MEDIDO del papel: menor tiempoReal (oído) o menor primerSonidoMs (habla). */
function coste(f: FichaServidorVoz, papel: Papel): number {
  if (!f?.voz) return Infinity;
  return papel === "oido" ? menorMedido(f.voz.oido, (x) => x.tiempoReal) : menorMedido(f.voz.habla, (x) => x.primerSonidoMs);
}

/** Menor coste medido, luego menor latencia de red, el A1 primero solo en empate, y alfabético. */
const orden = (papel: Papel) => (a: FichaServidorVoz, b: FichaServidorVoz): number =>
  coste(a, papel) - coste(b, papel)
  || (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity)
  || (b.a1 === true ? 1 : 0) - (a.a1 === true ? 1 : 0)
  || a.neurona.localeCompare(b.neurona);

/** Elige el servidor de un papel: histéresis con la actual, relevo si ya no está viva. */
function elegirPapel(
  papel: Papel, miembros: Set<string>, fichas: FichaServidorVoz[], ahora: number, actualId?: string,
): { id?: string; parte: string } {
  const etiqueta = papel === "oido" ? "oído" : "habla";
  const cands = fichas.filter((f) => esCandidata(f, papel, miembros, ahora)).sort(orden(papel));
  if (cands.length === 0) return { parte: `${etiqueta}: sin candidatos` };
  const mejor = cands[0];
  const costeMejor = coste(mejor, papel);
  const actual = actualId ? cands.find((f) => f.neurona === actualId) : undefined;
  if (actual && costeMejor >= coste(actual, papel) * (1 - MEJORA_MINIMA))
    return { id: actualId, parte: `${etiqueta}: ${actualId} se mantiene (histéresis)` };
  const parte = !actualId
    ? `${etiqueta}: ${mejor.neurona} (menor coste medido)`
    : !actual
      ? `${etiqueta}: relevo a ${mejor.neurona} (la anterior dejó de latir o ya no sirve)`
      : `${etiqueta}: cambia a ${mejor.neurona} (más de 30 % mejor)`;
  return { id: mejor.neurona, parte };
}

/** Sin candidata ajena por rápida (§5: audio solo hacia neuronas propias o de la sesión). */
export function elegirServidorVoz(p: PeticionServidorVoz): EleccionServidorVoz {
  try {
    if (!p?.sesion || !TIPOS_SESION.includes(p.sesion.tipo))
      return { motivo: "sesión inválida: falta el tipo de sesión o no es de la malla" };
    const fichas: FichaServidorVoz[] = Array.isArray(p?.fichas) ? p.fichas : [];
    const miembros = new Set(Array.isArray(p.sesion.miembros) ? p.sesion.miembros : []);
    const alguien = fichas.length > 0
      && fichas.some((f) => esCandidata(f, "oido", miembros, p.ahora) || esCandidata(f, "habla", miembros, p.ahora));
    if (!alguien) return { motivo: "sin neuronas vivas y de confianza: nadie sirve la voz de la sesión" };
    const oido = elegirPapel("oido", miembros, fichas, p.ahora, p.actual?.oido);
    const habla = elegirPapel("habla", miembros, fichas, p.ahora, p.actual?.habla);
    return {
      ...(oido.id ? { oido: oido.id } : {}),
      ...(habla.id ? { habla: habla.id } : {}),
      motivo: `${oido.parte} · ${habla.parte}`,
    };
  } catch {
    return { motivo: "no se pudo elegir el servidor de voz: los datos no sirven" };
  }
}
