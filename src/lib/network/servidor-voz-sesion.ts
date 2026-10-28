/**
 * servidor-voz-sesion — elección autogestionada del servidor de voz de la
 * sesión (Ola 1015V · S). Contrato: architecture/voz-fusionada-astraura.md §5.
 * Para cada sesión (una persona a solas, su grupo o una llamada) elige, de
 * entre las fichas del §5, la neurona con menor latencia MEDIDA, con RAM libre
 * suficiente, viva (latido < 2 min) y de confianza (tus neuronas, las de los
 * miembros de la sesión o el Oracle A1, 24/7). Con histéresis (solo cambia si
 * la nueva es un 30 % mejor o la actual dejó de latir) y relevo automático.
 * Puro y sin red: fichas, reloj y elección anterior inyectados; nunca lanza —
 * la voz solo va hacia neuronas de la sesión (§3) y esto lo decide el que
 * llama, no aquí.
 */

import type { ConfianzaVoz } from "./voz-por-malla";
import type { VozNodo } from "./capacidades-nodo";

/** Tipo de sesión que pide servidor de voz. */
export type TipoSesionVoz = "solo" | "grupo" | "llamada";

/** La sesión tal como la conoce quien elige: a quién pertenece y de qué tipo es. */
export interface SesionVoz {
  /** Cuentas participantes (las tuyas ya llegan como ficha «propia»). */
  miembros: string[];
  tipo: TipoSesionVoz;
}

/** Una ficha de neurona candidata (§5): de confianza solo si la sesión lo dice. */
export interface FichaServidorVoz {
  id: string;
  confianza: ConfianzaVoz;
  /** Cuenta dueña de la ficha; una ficha «grupo» debe pertenecer a un miembro. */
  cuenta?: string;
  /** Último latido visto, en ms absolutos. */
  latido: number;
  /** RAM libre medida; sin dato no se excluye (la ficha ya mide su motor vivo). */
  ramLibreMb?: number;
  /** El Oracle A1 (24/7) es servidor del ecosistema cuando está en las fichas. */
  a1?: boolean;
  /** Oído y habla MEDIDOS en esa neurona (nunca lo declarado, §5). */
  voz?: VozNodo;
}

/** La elección: qué neurona oye y qué neurona habla, con el motivo legible. */
export interface EleccionServidorVoz {
  oido?: string;
  habla?: string;
  motivo: string;
}

export interface OpcionesElegirServidorVoz {
  sesion: SesionVoz;
  fichas: FichaServidorVoz[];
  /** Reloj inyectado (ms absolutos). */
  ahora: number;
  /** Elección anterior, para la histéresis y el relevo. */
  actual?: EleccionServidorVoz;
}

/** Latido más viejo que esta ventana = neurona apagada (§5: latido < 2 min). */
export const LATIDO_VIVO_MS = 2 * 60 * 1000;
/** RAM libre mínima: oír (Phonon-2 son 164 MB) y hablar (OmniVoice Q4 ~600 MB), con margen. */
export const RAM_OIDO_MB = 512;
export const RAM_HABLA_MB = 1024;
/** Histéresis: solo cambia si la nueva es un 30 % mejor (su latencia < 10/13 de la actual). */
export const HISTERESIS = 1.3;

const positivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** Viva: latido < 2 min (un latido «del futuro» pasa: tolera desfase de reloj). */
function viva(f: FichaServidorVoz, ahora: number): boolean {
  return Number.isFinite(ahora) && Number.isFinite(f.latido) && ahora - f.latido < LATIDO_VIVO_MS;
}

/**
 * De confianza (§5): tus neuronas, el A1 24/7 del ecosistema, o una de los
 * miembros de la sesión (con su cuenta anotada, que la sesión confirmó).
 * Una ficha «ajena» jamás: el audio de la sesión no sale de su círculo.
 */
function deConfianza(f: FichaServidorVoz, sesion: SesionVoz): boolean {
  if (f?.confianza === "ajena") return false;
  if (f?.confianza === "propia" || f?.a1 === true) return true;
  return !f?.cuenta || (Array.isArray(sesion?.miembros) && sesion.miembros.includes(f.cuenta));
}

/** RAM libre suficiente para el lado; sin dato no se excluye (no hay supuestos). */
function ramSuficiente(f: FichaServidorVoz, min: number): boolean {
  return f.ramLibreMb === undefined || (positivo(f.ramLibreMb) && f.ramLibreMb >= min);
}

/** Menor latencia MEDIDA de una lista; `null` si no hay medidas (§5: nada inventado). */
function latMin<T>(lista: readonly T[] | undefined, val: (e: T) => unknown): number | null {
  const vs = (Array.isArray(lista) ? lista : []).map(val).filter(positivo);
  return vs.length ? Math.min(...vs) : null;
}
const latenciaOido = (f: FichaServidorVoz) => latMin(f.voz?.oido, (o) => o?.tiempoReal);
const latenciaHabla = (f: FichaServidorVoz) => latMin(f.voz?.habla, (h) => h?.primerSonidoMs);

interface Candidato { ficha: FichaServidorVoz; lat: number }
const ladoNombre = (lado: "oido" | "habla") => (lado === "oido" ? "oído" : "voz");

/** Candidatos del lado: viva, de confianza, con RAM suficiente y latencia medida. */
function candidatos(op: OpcionesElegirServidorVoz, lado: "oido" | "habla"): Candidato[] {
  const lista = Array.isArray(op.fichas) ? op.fichas : [];
  return lista
    .filter(
      (f) =>
        !!f && typeof f.id === "string" && f.id !== "" &&
        deConfianza(f, op.sesion) && viva(f, op.ahora))
    .map((f) => ({ ficha: f, lat: lado === "oido" ? latenciaOido(f) : latenciaHabla(f) }))
    .filter(
      (c): c is Candidato =>
        c.lat != null && ramSuficiente(c.ficha, lado === "oido" ? RAM_OIDO_MB : RAM_HABLA_MB))
    .sort((a, b) => a.lat - b.lat || a.ficha.id.localeCompare(b.ficha.id));
}

/**
 * Histéresis por lado (§5): se mantiene la actual salvo que la mejor nueva sea
 * un 30 % más rápida, o que la actual esté muerta o fuera de la confianza —
 * entonces la siguiente toma el relevo sola.
 */
function elegirLado(
  op: OpcionesElegirServidorVoz,
  lado: "oido" | "habla",
  actualId?: string,
): { id?: string; detalle: string } {
  const cand = candidatos(op, lado);
  const unidad = lado === "oido" ? "×" : " ms";
  if (!cand.length)
    return { detalle: `ninguna neurona viva y de confianza con ${ladoNombre(lado)} medida` };
  const mejor = cand[0];
  const actual = actualId ? cand.find((c) => c.ficha.id === actualId) : undefined;
  if (actual) {
    if (mejor.lat < actual.lat / HISTERESIS) {
      return {
        id: mejor.ficha.id,
        detalle: `${mejor.lat}${unidad}, mejor un 30 % que «${actual.ficha.id}» (${actual.lat}${unidad})`,
      };
    }
    return { id: actual.ficha.id, detalle: `${actual.lat}${unidad}, se mantiene por histéresis` };
  }
  const relevo = actualId
    ? `, relevo de «${actualId}» (sin latido o fuera de la confianza)`
    : ", primera elección";
  return { id: mejor.ficha.id, detalle: `${mejor.lat}${unidad}${relevo}` };
}

/** Elige el oído y la voz del servidor de la sesión. Puro; nunca lanza. */
export function elegirServidorVoz(op: OpcionesElegirServidorVoz): EleccionServidorVoz {
  try {
    const oido = elegirLado(op, "oido", op.actual?.oido);
    const habla = elegirLado(op, "habla", op.actual?.habla);
    const partes = [
      oido.id ? `Oído: «${oido.id}» · ${oido.detalle}` : `Sin oído: ${oido.detalle}`,
      habla.id ? `Habla: «${habla.id}» · ${habla.detalle}` : `Sin habla: ${habla.detalle}`,
    ];
    return {
      ...(oido.id ? { oido: oido.id } : {}),
      ...(habla.id ? { habla: habla.id } : {}),
      motivo: partes.join(" · "),
    };
  } catch {
    return { motivo: "No se pudo elegir el servidor de voz con las fichas recibidas." };
  }
}
