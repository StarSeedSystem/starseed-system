/**
 * servidor-voz-sesion.ts — Elección autogestionada del servidor de voz de la
 * sesión (Ola 1015V · tarea VZF1015S). Contrato:
 * architecture/voz-fusionada-astraura.md §5.
 *
 * Puro: sin red, sin disco, sin micrófono, sin procesos y sin reloj propio
 * (el `ahora` se inyecta). Nunca lanza: si algo no encaja devuelve el motivo
 * y sin elección («Aurora SIEMPRE habla», aurora-voz-motores.md).
 *
 * Reglas de §5: el servidor de la sesión es la neurona de CONFIANZA (tus
 * neuronas o las de los miembros de la sesión), en pie (latido < 2 min), con
 * RAM libre suficiente y la MENOR latencia MEDIDA (la `voz` anunciada por las
 * fichas, nunca lo declarado). El oído y la habla se eligen por separado,
 * porque la ficha mejor de oír no es siempre la mejor de hablar.
 * Histéresis: solo cambia si la nueva es ≥ 30 % mejor o la actual dejó de
 * valer. Y el Oracle A1 (24/7) entra como candidato siempre que esté en las
 * fichas: es servidor de oído para quien no tenga motor propio.
 */

import type { CapacidadesNodo } from "./capacidades-nodo";

/** Sesión a la que sirve el servidor: tú solo, tu grupo o una llamada. */
export type TipoSesionVoz = "solo" | "grupo" | "llamada";

export interface SesionVoz {
  tipo: TipoSesionVoz;
  /** Ids de nodo (nodoId) de los miembros de la sesión, la tuya incluida. */
  miembros: string[];
}

/** Elección resultante: un servidor por oído y otro por habla, pueden coincidir. */
export interface EleccionServidorVoz {
  oido?: CapacidadesNodo;
  habla?: CapacidadesNodo;
  motivo: string;
}

export interface EntradaElegirServidorVoz {
  sesion: SesionVoz;
  /** Fichas de voz anunciadas (§5): las mías, las de los miembros y las demás. */
  fichas: readonly CapacidadesNodo[];
  /** Reloj inyectado (ms). */
  ahora: number;
  /** Elección anterior, para la histéresis y el relevo. */
  actual?: EleccionServidorVoz;
}

/** Un latido más viejo que esto ya no es un servidor en pie (§5). */
export const LATIDO_SERVIDOR_MAX_MS = 2 * 60 * 1000;
/** RAM libre mínima: el nivel «alta» del motor único (Q4_K_M, ~600 MB). */
export const RAM_SERVIDOR_MIN_MB = 600;
/** Histéresis: la nueva solo toma el turno si es al menos un 30 % mejor. */
export const HISTERESIS_FRACCION = 0.3;

/** El rol que una ficha puede servir en la sesión: oír o hablar. */
export type RolVoz = "oido" | "habla";

/**
 * El Oracle A1 (24/7): la ficha de nube de la malla que sirve a la cuenta o
 * al público (§5: «El Oracle A1 (24/7) es servidor de oído para quien no
 * tenga motor propio»). Una ficha de nube ajena (solo «propio») no es de ella.
 */
function esA1(f: CapacidadesNodo): boolean {
  const ambitos = f.ambitos ?? [];
  return f.medio === "nube" && (ambitos.includes("cuenta") || ambitos.includes("publico"));
}

/**
 * Confianza (§5): tus neuronas (las que anuncian servir a tu cuenta) o las de
 * los miembros de la sesión. Las demás fichas —por muy rápidas que midan—
 * nunca recibirán el audio de la sesión.
 */
function confiable(f: CapacidadesNodo, miembros: readonly string[]): boolean {
  return (
    miembros.includes(f.nodoId) ||
    (f.ambitos ?? []).includes("cuenta") ||
    esA1(f)
  );
}

/** En pie según el latido (`t`), con el reloj que entra por parámetro. */
function enPie(f: CapacidadesNodo, ahora: number): boolean {
  const edad = ahora - f.t;
  return edad >= 0 && edad < LATIDO_SERVIDOR_MAX_MS;
}

/**
 * La mejor (menor) latencia MEDIDA de la ficha para el rol: la menor de
 * `voz.oido` (tiempo real del oído) o de `voz.habla` (primer sonido, en ms).
 */
function latencia(f: CapacidadesNodo, rol: RolVoz): number | undefined {
  const voz = f.voz;
  if (!voz) return undefined;
  const todas = rol === "oido" ? voz.oido.map((o) => o.tiempoReal) : voz.habla.map((h) => h.primerSonidoMs);
  const buenas = todas.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  return buenas.length > 0 ? Math.min(...buenas) : undefined;
}

/** ¿Puede esta ficha servir este rol en la sesión ahora mismo? */
function puede(f: CapacidadesNodo, sesion: SesionVoz, ahora: number, rol: RolVoz): boolean {
  return (
    enPie(f, ahora) &&
    f.ramLibreMb >= RAM_SERVIDOR_MIN_MB &&
    confiable(f, sesion.miembros) &&
    latencia(f, rol) !== undefined
  );
}

/** Etiqueta del rol en los motivos, en español. */
const NOMBRE_ROL: Record<RolVoz, string> = { oido: "oído", habla: "habla" };

interface OfertaRol {
  ficha?: CapacidadesNodo;
  parte: string;
}

/**
 * Elige el servidor de un rol entre las fichas, aplicando §5: menor latencia
 * medida, histéresis con la elegida antes, relevo al dejar de valer y motivo
 * en español. `actualId` es la ficha elegida para ese rol en la ronda previa.
 */
function elegirRol(
  fichas: readonly CapacidadesNodo[],
  sesion: SesionVoz,
  ahora: number,
  rol: RolVoz,
  actualId?: string,
): OfertaRol {
  const etiqueta = NOMBRE_ROL[rol];
  const candidatos = fichas.filter((f) => puede(f, sesion, ahora, rol));
  if (candidatos.length === 0) {
    const hayExcluidas = fichas.some((f) => enPie(f, ahora) && f.ramLibreMb >= RAM_SERVIDOR_MIN_MB && latencia(f, rol) !== undefined);
    return { parte: hayExcluidas ? `${etiqueta}: sin candidatas de confianza (privacidad)` : `${etiqueta}: sin fichas de voz en pie` };
  }
  candidatos.sort(
    (a, b) =>
      (latencia(a, rol) as number) - (latencia(b, rol) as number) ||
      b.ramLibreMb - a.ramLibreMb ||
      a.nodoId.localeCompare(b.nodoId),
  );
  const mejor = candidatos[0];
  const actual = actualId ? fichas.find((f) => f.nodoId === actualId) : undefined;
  const latActual = actual ? latencia(actual, rol) : undefined;
  if (actual && latActual !== undefined && puede(actual, sesion, ahora, rol)) {
    const latMejor = latencia(mejor, rol) as number;
    if (mejor.nodoId === actual.nodoId || latMejor >= latActual * (1 - HISTERESIS_FRACCION)) {
      return { ficha: actual, parte: `${etiqueta}: se mantiene ${actual.nodoId} (histéresis)` };
    }
    const mejora = Math.round((1 - latMejor / latActual) * 100);
    return { ficha: mejor, parte: `${etiqueta}: cambia a ${mejor.nodoId}, ${mejora} % mejor (histéresis)` };
  }
  if (actualId) {
    return { ficha: mejor, parte: `${etiqueta}: relevo a ${mejor.nodoId} (la anterior ya no sirve)` };
  }
  const valor = latencia(mejor, rol) as number;
  const marca = rol === "habla" ? ` ${Math.round(valor)} ms` : ` ${valor}`;
  return { ficha: mejor, parte: `${etiqueta}: ${mejor.nodoId} (${marca}) como ${etiqueta} de la sesión` };
}

/**
 * elegirServidorVoz — qué neurona sirve el oído y cuál la voz de la sesión
 * (tú solo, tu grupo o una llamada), según el contrato §5 y con los datos
 * medidos de las fichas. Puro y sin reloj propio: el `ahora` entra por parámetro.
 *  · filtra por confianza, latido vivo (< 2 min) y RAM libre suficiente;
 *  · elige la de menor latencia medida, oído y habla POR SEPARADO;
 *  · incluye el A1 (24/7) siempre que esté en las fichas;
 *  · con `actual` aplica histéresis: solo cambia si lo nuevo es ≥ 30 % mejor,
 *    y hace el RELEVO en cuanto la elegida dejó de latir o dejó de valer;
 *  · sin candidatas devuelve { motivo } sin fichas, nunca lanza.
 */
export function elegirServidorVoz(e: EntradaElegirServidorVoz): EleccionServidorVoz {
  try {
    const sesion = e.sesion;
    const fichas = Array.isArray(e.fichas) ? e.fichas : [];
    const oido = elegirRol(fichas, sesion, e.ahora, "oido", e.actual?.oido?.nodoId);
    const habla = elegirRol(fichas, sesion, e.ahora, "habla", e.actual?.habla?.nodoId);
    return {
      ...(oido.ficha ? { oido: oido.ficha } : {}),
      ...(habla.ficha ? { habla: habla.ficha } : {}),
      motivo: [`sesión ${sesion.tipo}`, oido.parte, habla.parte].filter(Boolean).join(" · "),
    };
  } catch {
    return { motivo: "sesión sin elección: la entrada no encaja" };
  }
}

