/**
 * servidor-voz-sesion.ts — elección del servidor de voz de sesión (VZF1015S).
 * Contrato: architecture/voz-fusionada-astraura.md §5. Módulo PURO: sin red, sin
 * disco, sin procesos; fichas y reloj inyectables. Nunca lanza.
 * Reglas: viva (latido < 2 min) · de confianza (solo neuronas de la sesión) ·
 * RAM libre suficiente · menor latencia MEDIDA, con histéresis de 30 % y relevo.
 * El A1 (24/7) entra como una ficha más cuando está en las fichas.
 */

import type { VozNodo } from "./capacidades-nodo";

export type TipoSesion = "solo" | "grupo" | "llamada";

/** Ids de neurona: los mismos que `nodoId` (CapacidadesNodo) o `neuronDeviceId` (ficha). */
export type Neurona = string;

/** Una ficha mínima para la elección. La `voz` es la MEDIDA de la ficha del §5. */
export interface FichaServVoz {
  nodoId: Neurona;
  /** Último latido visto, en ms de época. Un latido del futuro se considera inválido. */
  latido: number;
  /** RAM libre anunciada, en MB. */
  ramLibreMb: number;
  /** Oído y habla medidos (VozNodo, VZF1015Q); sin medidas, no puede servir. */
  voz?: VozNodo;
  /** true en el A1 u otro servidor 24/7: solo desempata. */
  a247?: boolean;
}

export interface SesionVoz {
  tipo: TipoSesion;
  /** Ids de neurona de confianza: las tuyas y las de los miembros de la sesión. */
  miembros: Neurona[];
}

export interface EleccionServVoz {
  /** La entrada elegida: `{ sesion, fichas, ahora, actual? }`. */
  /** Neurona que sirve de OÍDO de la sesión (transcribe), si hay alguna elegible. */
  oido?: Neurona;
  /** Neurona que sirve la VOZ de la sesión (sintetiza), si hay alguna elegible. */
  habla?: Neurona;
  /** Motivo en español, con la decisión de cada lado explicada. */
  motivo: string;
}

export interface EntradaElegirServVoz {
  sesion: SesionVoz;
  fichas: readonly FichaServVoz[];
  /** Ahora, en ms de época (reloj inyectable). */
  ahora: number;
  /** Elección vigente, para la histéresis y el relevo. */
  actual?: { oido?: Neurona; habla?: Neurona };
}

/** Un latido más viejo que esto y la neurona dejó de latir. */
export const LATIDO_MAX_MS = 2 * 60 * 1000;
/** RAM mínima para servir voz de sesión (oído ligero Phonon-2 de 164 MB con margen). */
export const RAM_MIN_SERVIDOR_VOZ_MB = 512;
/** La nueva solo desplaza a la actual si queda en el 70 % de su latencia (30 % mejor). */
export const HISTERESIS_FACTOR = 0.7;

/** Latencia (menor es mejor) de la ficha para un lado: la mínima medida entre sus motores. */
function latenciaMenor(f: FichaServVoz, lado: "oido" | "habla"): number | null {
  const lista = lado === "oido" ? f.voz?.oido : f.voz?.habla;
  const valores = (lista ?? [])
    .map((e) => (lado === "oido" ? (e as { tiempoReal?: unknown }).tiempoReal : (e as { primerSonidoMs?: unknown }).primerSonidoMs))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return valores.length > 0 ? Math.min(...valores) : null;
}

/* * ¿La ficha está viva y es de confianza (solo miembros de la sesión)? */
function esCandidata(f: FichaServVoz, miembro: Set<Neurona>, ahora: number): boolean {
  if (!f || typeof f.nodoId !== "string" || f.nodoId.trim() === "") return false;
  if (!miembro.has(f.nodoId)) return false;
  if (!(typeof f.latido === "number" && Number.isFinite(f.latido) && f.latido <= ahora)) return false;
  if (ahora - f.latido >= LATIDO_MAX_MS) return false;
  return typeof f.ramLibreMb === "number" && Number.isFinite(f.ramLibreMb) && f.ramLibreMb >= RAM_MIN_SERVIDOR_VOZ_MB;
}

interface EleccionLado { ficha: FichaServVoz; lat: number; cambio?: "mejora" }

/** Elige un lado (oído o habla) aplicando las reglas; devuelve también el motivo parcial. */
function elegirLado(
  fichas: readonly FichaServVoz[],
  miembro: Set<Neurona>,
  ahora: number,
  lado: "oido" | "habla",
  actualId: Neurona | undefined,
): EleccionLado | null {
  const conLat = fichas
    .filter((f) => esCandidata(f, miembro, ahora))
    .map((f) => {
      const lat = latenciaMenor(f, lado);
      return lat === null ? null : { ficha: f, lat };
    })
    .filter((e): e is EleccionLado => e !== null);
  if (conLat.length === 0) return null;
  // Menor latencia medida; desempata: 24/7 primero, después el id (determinista).
  const mejor = [...conLat].sort(
    (a, b) => a.lat - b.lat || Number(b.ficha.a247 === true) - Number(a.ficha.a247 === true) || a.ficha.nodoId.localeCompare(b.ficha.nodoId),
  )[0];
  const actual = actualId === undefined ? undefined : conLat.find((e) => e.ficha.nodoId === actualId);
  if (actual === undefined || actual === mejor) return mejor;
  if (mejor.lat < actual.lat * HISTERESIS_FACTOR) {
    return { ...mejor, cambio: "mejora" }; // la nueva queda un 30 % por debajo: cambio justificado
  }
  return actual; // histéresis: la nueva no es un 30 % mejor, no se salta
}

/**
 * elegirServidorVoz — elige el oído y la voz de la sesión con las fichas medidas
 * del §5. Devuelve `{ oido?, habla?, motivo }`; sin candidatos, solo el motivo
 * (y el llamador sigue con su motor propio). Histéresis y relevo por lado:
 * se cambia solo si la nueva es un 30 % mejor o la actual dejó de ser elegible.
 */
export function elegirServidorVoz({
  sesion,
  fichas,
  ahora,
  actual,
}: EntradaElegirServVoz): EleccionServVoz {
  const vacio = (porQue: string): EleccionServVoz => ({ motivo: porQue });
  try {
    const miembro = new Set((Array.isArray(sesion?.miembros) ? sesion.miembros : []).filter(
      (m): m is Neurona => typeof m === "string" && m.trim() !== "",
    ));
    const fichasSanas = (Array.isArray(fichas) ? fichas : []).filter(
      (f) => f && typeof f === "object",
    );
    if (miembro.size === 0) {
      return vacio(`sesión ${sesion?.tipo ?? "?"} sin neuronas de confianza conocidas: cada una sirve con su motor propio`);
    }
    if (fichasSanas.length === 0) {
      return vacio(`sesión ${sesion.tipo}: sin fichas todavía, cada una sirve con su motor propio`);
    }
    const partes: string[] = [];
    const tipo = typeof sesion.tipo === "string" && sesion.tipo !== "" ? sesion.tipo : "?";
    let salida: EleccionServVoz = { motivo: "" };
    const poner = (k: "oido" | "habla", e: EleccionLado): void => {
      const aunqueViva = actual?.[k] !== undefined && actual[k] !== e.ficha.nodoId;
      const causa = aunqueViva ? (e.cambio === "mejora" ? " · nueva un 30 % mejor" : " · relevo de " + actual[k]) : "";
      partes.push(`${k}: ${e.ficha.nodoId} (lat ${formatea(e.lat)})${causa}`);
      salida = { ...salida, [k]: e.ficha.nodoId };
    };
    const eOido = elegirLado(fichasSanas, miembro, ahora, "oido", actual?.oido);
    if (eOido) poner("oido", eOido);
    const eHabla = elegirLado(fichasSanas, miembro, ahora, "habla", actual?.habla);
    if (eHabla) poner("habla", eHabla);
    if (partes.length === 0) {
      return vacio(`sesión ${tipo}: ninguna neurona de la sesión está viva (latido < 2 min) o con RAM y medidas suficientes`);
    }
    return { ...salida, motivo: `sesión ${tipo} · ${partes.join(" · ")}` };
  } catch {
    return vacio("datos inválidos para la elección: cada una sirve con su motor propio");
  }
}

/** Milisegundos legibles: «12 ms», «1,2 s». */
function formatea(ms: number): string {
  return Number.isFinite(ms) && ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}
