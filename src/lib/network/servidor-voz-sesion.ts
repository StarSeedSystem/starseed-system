/**
 * servidor-voz-sesion.ts — Elección autogestionada del servidor de voz de una
 * sesión (§ de architecture/voz-fusionada-astraura.md). Pura: sin red, sin
 * disco, sin procesos; todo lo externo llega en las fichas.
 */

export type TipoSesionVoz = "propia" | "grupo" | "llamada";

/** De quién es la neurona, tal como la sesión la ve. */
export type ConfianzaNeurona = "propia" | "miembro" | "ajena";

/** Una neurona candidata a servir oído y/o habla, con lo MEDIDO. */
export interface FichaVozSesion {
  neurona: string;
  /** Capacidades de voz medidas (`VozNodo` de capacidades-nodo.ts). */
  voz?: { oido: { motor: string; idiomas: string[]; tiempoReal: number; flujo: boolean }[]; habla: { motor: string; primerSonidoMs: number }[] };
  /** Latencia medida hacia la neurona (ms), del enlace de la malla. */
  latenciaMs?: number;
  /** RAM libre anunciada (Mb); undefined si el medio no la informa. */
  ramLibreMb?: number;
  /** Marca de tiempo del último latido recibido (ms). */
  ultimoLatidoMs?: number;
  confianza: ConfianzaNeurona;
  /** Servidor 24/7 (p. ej. el Oracle A1): cabe en las fichas como los demás. */
  siempreEncendida?: boolean;
}

/** La elegida: la neurona que sirve esa pieza. */
export interface NeuronaElegida { neurona: string; motor: string; score: number }

export interface EleccionServidorVoz {
  oido?: NeuronaElegida;
  habla?: NeuronaElegida;
  motivo: string;
}

export interface SesionVoz { miembros: string[]; tipo: TipoSesionVoz }

export interface EntradaEleccionVoz {
  sesion: SesionVoz;
  fichas: readonly FichaVozSesion[];
  ahora: number;
  /** Elección anterior, para la histéresis. */
  actual?: { oido?: NeuronaElegida; habla?: NeuronaElegida };
  /** RAM libre mínima exigida a un candidato, en Mb (por defecto 512). */
  minRamMb?: number;
}

/** Un latido más viejo que esto = la neurona dejó de latir (§5: «encendida»). */
export const VENTANA_LATIDO_MS = 2 * 60 * 1000;
const MEJOR_RELATIVA = 0.7; // solo cambiar si la nueva es un 30 % mejor o la actual murió

/** RAM libre suficiente; si el medio no la informa, no se puede exigir. */
const ramSuficiente = (f: FichaVozSesion, min: number): boolean => f.ramLibreMb === undefined || f.ramLibreMb >= min;

/** Las piezas que esta ficha puede servir, cada una con su motor y su coste. */
export function piezasFicha(f: FichaVozSesion, minRam: number): { oido: NeuronaElegida | null; habla: NeuronaElegida | null } {
  if (f.confianza === "ajena" || !ramSuficiente(f, minRam)) return { oido: null, habla: null };
  const v = f.voz;
  if (!v || (v.oido.length === 0 && v.habla.length === 0)) return { oido: null, habla: null };
  const lat = (f.latenciaMs !== undefined && f.latenciaMs >= 0 ? f.latenciaMs : Infinity);
  const mejorOido = [...v.oido].sort((a, b) => a.tiempoReal - b.tiempoReal)[0];
  const mejorHabla = [...v.habla].sort((a, b) => a.primerSonidoMs - b.primerSonidoMs)[0];
  return {
    oido: mejorOido ? { neurona: f.neurona, motor: mejorOido.motor, score: lat } : null,
    habla: mejorHabla ? { neurona: f.neurona, motor: mejorHabla.motor, score: lat } : null,
  };
}

/** Mejora al menos un 30 % respecto de la ficha actual (histéresis del §5). */
function mejorUnTreinta(nueva: NeuronaElegida | undefined, previa?: NeuronaElegida): boolean {
  if (!previa) return true;
  if (nueva === undefined) return false;
  if (nueva.neurona === previa.neurona && nueva.motor === previa.motor) return false;
  const base = previa.score > 0 ? previa.score : 1;
  return nueva.score <= base * MEJOR_RELATIVA;
}

export function elegirServidorVoz({ fichas, ahora, actual, minRamMb }: EntradaEleccionVoz): EleccionServidorVoz {
  const minRam = minRamMb ?? 512;
  const latidoFresco = (f: FichaVozSesion): boolean => f.ultimoLatidoMs !== undefined && ahora - f.ultimoLatidoMs >= 0 && ahora - f.ultimoLatidoMs < VENTANA_LATIDO_MS;
  const candidatas: FichaVozSesion[] = fichas.filter(latidoFresco);

  const porPieza = (pieza: "oido" | "habla", previa?: NeuronaElegida): NeuronaElegida | undefined => {
    const mejores = candidatas
      .map((f) => piezasFicha(f, minRam)[pieza])
      .filter((p): p is NeuronaElegida => p !== null)
      .sort((a, b) => a.score - b.score || a.neurona.localeCompare(b.neurona));
    const ganadora = mejores[0];
    if (!ganadora) return undefined;
    if (previa && !mejores.some((p) => p.neurona === previa.neurona && previa.motor === p.motor)) {
      // La actual dejó de latir o ya no anuncia la pieza: relevo a la mejor viva.
      return ganadora;
    }
    return mejorUnTreinta(ganadora, previa) ? ganadora : previa;
  };

  const oido = porPieza("oido", actual?.oido);
  const habla = porPieza("habla", actual?.habla);
  const cambio = (a: NeuronaElegida | undefined, b?: NeuronaElegida) =>
    a === undefined ? "sin candidata" : !b ? "elegida por menor latencia" : b.neurona === a.neurona && a.motor === b.motor ? "sin cambio · histéresis" : "relevo";
  return {
    oido, habla,
    motivo: oido === undefined && habla === undefined
      ? "sin candidata de confianza viva"
      : [cambio(oido, actual?.oido), cambio(habla, actual?.habla)].filter((m, i, t) => t.indexOf(m) === i).join(" · "),
  };
}
