/**
 * Reparto democrático de fragmentos — StarSeed OS
 *
 * Coloca los n fragmentos entre las ofertas de la malla según salud, cupo por
 * reciprocidad y diversidad (no todo en el mismo aparato, red o persona).
 * Calcula además cuándo un nodo se va y qué fragmentos hay que reparar. Todo es
 * función pura: no toca red, disco ni procesos.
 */

import type { SaludAlmacen } from "./modelo";

/** Un GiB aportado a la malla regala un cupo extra de fragmento. */
export const UNIDAD_APORTE_BYTES = BigInt(1024 * 1024 * 1024);

export interface OfertaNodo {
  nodoId: string;
  aparatoId: string;
  redId: string;
  personaId: string;
  libreBytes: bigint;
  aportadoBytes: bigint;
  consumidoBytes: bigint;
  cupoBase: number;
  salud: SaludAlmacen;
  enLinea: boolean;
}

export interface FragmentoColocado {
  indiceFragmento: number;
  nodoId: string;
}

export interface ResumenDiversidad {
  aparatos: number;
  redes: number;
  personas: number;
  dominios: number;
}

export interface OpcionesReparto {
  k: number;
  n: number;
  tamanoFragmentoBytes: bigint;
  maxPorNodo?: number;
}

export interface ResultadoReparto {
  ok: boolean;
  colocaciones: FragmentoColocado[];
  errores: string[];
  diversidad: ResumenDiversidad;
  diversidadSuficiente: boolean;
}

export interface EvaluacionReparto {
  vivos: number;
  perdidos: number[];
  recuperable: boolean;
  necesitaReparacion: boolean;
}

const PESO_SALUD: Record<SaludAlmacen, number> = {
  excelente: 8,
  buena: 6,
  regular: 3,
  critica: -100,
  desconocida: 1,
};

function vacio(): ResumenDiversidad {
  return { aparatos: 0, redes: 0, personas: 0, dominios: 0 };
}

function resumir(
  colocaciones: readonly FragmentoColocado[],
  porNodo: ReadonlyMap<string, OfertaNodo>,
): ResumenDiversidad {
  const aparatos = new Set<string>();
  const redes = new Set<string>();
  const personas = new Set<string>();
  const dominios = new Set<string>();
  for (const colocacion of colocaciones) {
    const oferta = porNodo.get(colocacion.nodoId);
    if (!oferta) continue;
    aparatos.add(oferta.aparatoId);
    redes.add(oferta.redId);
    personas.add(oferta.personaId);
    dominios.add(`${oferta.aparatoId}|${oferta.redId}|${oferta.personaId}`);
  }
  return { aparatos: aparatos.size, redes: redes.size, personas: personas.size, dominios: dominios.size };
}

function esApta(oferta: OfertaNodo, tamano: bigint): boolean {
  return (
    oferta.enLinea &&
    oferta.salud !== "critica" &&
    oferta.libreBytes >= tamano &&
    cupoPorReciprocidad(oferta) > 0
  );
}

interface ContextoColocacion {
  ofertas: readonly OfertaNodo[];
  opciones: OpcionesReparto;
  excluir?: ReadonlySet<string>;
  semilla?: readonly FragmentoColocado[];
}

function colocar(indices: readonly number[], contexto: ContextoColocacion): ResultadoReparto {
  const { ofertas, opciones, excluir, semilla } = contexto;
  const porNodo = new Map<string, OfertaNodo>(
    ofertas.map((oferta): [string, OfertaNodo] => [oferta.nodoId, oferta]),
  );
  const candidatas = ofertas.filter(
    (oferta) => !excluir?.has(oferta.nodoId) && esApta(oferta, opciones.tamanoFragmentoBytes),
  );
  const cupos = new Map<string, number>(
    candidatas.map((oferta): [string, number] => [
      oferta.nodoId,
      Math.min(cupoPorReciprocidad(oferta), opciones.maxPorNodo ?? Number.MAX_SAFE_INTEGER),
    ]),
  );

  const conteoNodo = new Map<string, number>();
  const conteoAparato = new Map<string, number>();
  const conteoRed = new Map<string, number>();
  const conteoPersona = new Map<string, number>();
  const sumar = (mapa: Map<string, number>, clave: string): void => {
    mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
  };
  for (const colocacion of semilla ?? []) {
    const oferta = porNodo.get(colocacion.nodoId);
    if (!oferta) continue;
    sumar(conteoNodo, oferta.nodoId);
    sumar(conteoAparato, oferta.aparatoId);
    sumar(conteoRed, oferta.redId);
    sumar(conteoPersona, oferta.personaId);
  }

  const colocaciones: FragmentoColocado[] = [];
  const errores: string[] = [];
  for (const indice of indices) {
    let mejor: OfertaNodo | null = null;
    let mejorPeso = Number.NEGATIVE_INFINITY;
    for (const oferta of candidatas) {
      const usados = conteoNodo.get(oferta.nodoId) ?? 0;
      if (usados >= (cupos.get(oferta.nodoId) ?? 0)) continue;
      const peso =
        PESO_SALUD[oferta.salud] -
        1000 * (conteoAparato.get(oferta.aparatoId) ?? 0) -
        300 * (conteoRed.get(oferta.redId) ?? 0) -
        100 * (conteoPersona.get(oferta.personaId) ?? 0) -
        10 * usados;
      if (peso > mejorPeso || (peso === mejorPeso && mejor !== null && oferta.nodoId < mejor.nodoId)) {
        mejor = oferta;
        mejorPeso = peso;
      }
    }
    if (!mejor) {
      errores.push(`Sin cupo disponible para el fragmento ${indice}.`);
      break;
    }
    colocaciones.push({ indiceFragmento: indice, nodoId: mejor.nodoId });
    sumar(conteoNodo, mejor.nodoId);
    sumar(conteoAparato, mejor.aparatoId);
    sumar(conteoRed, mejor.redId);
    sumar(conteoPersona, mejor.personaId);
  }

  const diversidad = resumir(colocaciones, porNodo);
  return {
    ok: colocaciones.length === indices.length && errores.length === 0,
    colocaciones,
    errores,
    diversidad,
    diversidadSuficiente:
      colocaciones.length <= 1 ||
      (diversidad.aparatos > 1 && diversidad.redes > 1 && diversidad.personas > 1),
  };
}

export function cupoPorReciprocidad(
  oferta: Pick<OfertaNodo, "aportadoBytes" | "consumidoBytes" | "cupoBase">,
): number {
  const balance = oferta.aportadoBytes - oferta.consumidoBytes;
  const extra = balance > BigInt(0) ? Number(balance / UNIDAD_APORTE_BYTES) : 0;
  return Math.max(0, Math.floor(oferta.cupoBase) + extra);
}

export function repartirFragmentos(
  ofertas: readonly OfertaNodo[],
  opciones: OpcionesReparto,
): ResultadoReparto {
  if (
    !Number.isInteger(opciones.k) ||
    !Number.isInteger(opciones.n) ||
    opciones.k < 1 ||
    opciones.n < opciones.k ||
    opciones.n > 255
  ) {
    return {
      ok: false,
      colocaciones: [],
      errores: ["Parámetros inválidos: se exige 1 ≤ k ≤ n ≤ 255."],
      diversidad: vacio(),
      diversidadSuficiente: false,
    };
  }
  if (opciones.tamanoFragmentoBytes <= BigInt(0)) {
    return {
      ok: false,
      colocaciones: [],
      errores: ["El tamaño del fragmento debe ser mayor que cero."],
      diversidad: vacio(),
      diversidadSuficiente: false,
    };
  }
  const indices = Array.from({ length: opciones.n }, (_, indice) => indice);
  return colocar(indices, { ofertas, opciones });
}

/** Evalúa qué fragmentos viven todavía y si el reparto aguanta o urge reparar. */
export function evaluarReparto(
  colocaciones: readonly FragmentoColocado[],
  nodosVivos: readonly string[],
  k: number,
): EvaluacionReparto {
  const vivosSet = new Set(nodosVivos);
  const perdidos = colocaciones
    .filter((colocacion) => !vivosSet.has(colocacion.nodoId))
    .map((colocacion) => colocacion.indiceFragmento);
  const vivos = colocaciones.length - perdidos.length;
  return {
    vivos,
    perdidos,
    recuperable: vivos >= k,
    necesitaReparacion: perdidos.length > 0,
  };
}

/**
 * Recoloca solo los fragmentos perdidos cuando un nodo se va. Mantiene la
 * diversidad respecto a los que siguen vivos y evita volver a los nodos caídos.
 */
export function repararFragmentos(
  ofertas: readonly OfertaNodo[],
  opciones: OpcionesReparto,
  colocaciones: readonly FragmentoColocado[],
  nodosVivos: readonly string[],
): ResultadoReparto {
  const evaluacion = evaluarReparto(colocaciones, nodosVivos, opciones.k);
  if (!evaluacion.necesitaReparacion) {
    return { ok: true, colocaciones: [], errores: [], diversidad: vacio(), diversidadSuficiente: true };
  }
  const vivosSet = new Set(nodosVivos);
  const semilla = colocaciones.filter((colocacion) => vivosSet.has(colocacion.nodoId));
  const excluir = new Set(
    colocaciones
      .filter((colocacion) => !vivosSet.has(colocacion.nodoId))
      .map((colocacion) => colocacion.nodoId),
  );
  return colocar(evaluacion.perdidos, { ofertas, opciones, semilla, excluir });
}
