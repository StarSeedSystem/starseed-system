/**
 * mundo-linaje.ts — Funciones PURAS para la vista de linaje: "el linaje es
 * un árbol, no una nube". `NodoLinaje` trae `progenitorId` y `generacion`;
 * aquí se resuelve eso en un árbol de verdad (con generación calculada, no
 * confiada a ciegas) y en una disposición 2D (fila = generación, columna =
 * orden entre hermanos) que tanto la escena 3D como el respaldo 2D pueden
 * dibujar sin más que proyectar.
 *
 * Nada de esto depende de React ni de three.js — ver mundo-linaje.test.ts.
 */

import type { NodoLinaje } from "@/lib/astraura/genesis-types";
import type { AristaVisible, DisposicionLinaje, PosicionLinaje } from "./mundo-tipos";

export interface ArbolLinaje {
  readonly raices: readonly string[];
  readonly hijosPorId: ReadonlyMap<string, readonly string[]>;
  readonly padrePorId: ReadonlyMap<string, string | null>;
}

/**
 * Resuelve el árbol real a partir de nodos sueltos.
 *  - `progenitorId` que no aparece entre los nodos recibidos → esa persona
 *    se trata como raíz (el progenitor puede haberse ido, o ser de otra
 *    tanda que no llegó por props) — no es un error, es un origen.
 *  - Un ciclo (dato corrupto: A antepasado de sí mismo) se corta en el
 *    punto donde se cierra, convirtiendo ese nodo en raíz. El punto de
 *    corte se decide recorriendo los nodos en orden de id — NO en el orden
 *    en que llegaron por props — para que el resultado no dependa de un
 *    detalle tan frágil como el orden de un array.
 */
export function construirArbolLinaje(nodos: readonly NodoLinaje[]): ArbolLinaje {
  const porId = new Map(nodos.map((n) => [n.id, n] as const));
  const padrePorId = new Map<string, string | null>();
  for (const nodo of nodos) {
    const candidato = nodo.progenitorId;
    padrePorId.set(nodo.id, candidato && porId.has(candidato) ? candidato : null);
  }

  const idsOrdenados = Array.from(porId.keys()).sort();
  for (const idInicial of idsOrdenados) {
    const vistos = new Set<string>();
    let actual: string | null = idInicial;
    while (actual) {
      if (vistos.has(actual)) {
        padrePorId.set(actual, null); // corta el ciclo justo donde se repite
        break;
      }
      vistos.add(actual);
      actual = padrePorId.get(actual) ?? null;
    }
  }

  const hijosPorId = new Map<string, string[]>();
  for (const id of idsOrdenados) hijosPorId.set(id, []);
  const raices: string[] = [];
  for (const id of idsOrdenados) {
    const padre = padrePorId.get(id) ?? null;
    if (padre) hijosPorId.get(padre)?.push(id);
    else raices.push(id);
  }

  // Orden estable entre hermanos y entre raíces: por nombre y, si empatan,
  // por id — determinista, no depende del orden de llegada.
  const comparar = (a: string, b: string): number => {
    const na = porId.get(a)?.nombre ?? a;
    const nb = porId.get(b)?.nombre ?? b;
    return na === nb ? a.localeCompare(b) : na.localeCompare(nb);
  };
  raices.sort(comparar);
  for (const hijos of hijosPorId.values()) hijos.sort(comparar);

  return { raices, hijosPorId, padrePorId };
}

export interface OpcionesDisposicionLinaje {
  /** Separación horizontal entre hojas contiguas (unidades de escena). */
  readonly espacioHorizontal?: number;
  /** Separación vertical entre generaciones (unidades de escena). */
  readonly espacioVertical?: number;
}

const ESPACIO_HORIZONTAL_DEFECTO = 3;
const ESPACIO_VERTICAL_DEFECTO = 4;

/**
 * Dispone el árbol de linaje en 2D: fila = generación REAL (calculada
 * recorriendo el árbol resuelto, no el campo `generacion` del dato — que
 * puede estar desincronizado), columna = contador de hojas en post-orden,
 * cada nodo interno centrado sobre sus hijos. Sin solapes, determinista,
 * sin `Math.random`.
 */
export function calcularDisposicionLinaje(
  nodos: readonly NodoLinaje[],
  opciones: OpcionesDisposicionLinaje = {},
): DisposicionLinaje {
  if (nodos.length === 0) {
    return { posiciones: new Map(), raices: [], aristas: [], generacionMaxima: 0 };
  }

  const { raices, hijosPorId, padrePorId } = construirArbolLinaje(nodos);
  const espacioH = opciones.espacioHorizontal ?? ESPACIO_HORIZONTAL_DEFECTO;
  const espacioV = opciones.espacioVertical ?? ESPACIO_VERTICAL_DEFECTO;

  const profundidadPorId = new Map<string, number>();
  for (const raiz of raices) profundidadPorId.set(raiz, 0);
  const cola: string[] = [...raices];
  let cabeza = 0;
  let generacionMaxima = 0;
  while (cabeza < cola.length) {
    const id = cola[cabeza++];
    const profundidad = profundidadPorId.get(id) ?? 0;
    if (profundidad > generacionMaxima) generacionMaxima = profundidad;
    for (const hijoId of hijosPorId.get(id) ?? []) {
      profundidadPorId.set(hijoId, profundidad + 1);
      cola.push(hijoId);
    }
  }

  const xPorId = new Map<string, number>();
  let siguienteHoja = 0;
  const asignarX = (id: string): number => {
    const hijos = hijosPorId.get(id) ?? [];
    if (hijos.length === 0) {
      const x = siguienteHoja++;
      xPorId.set(id, x);
      return x;
    }
    const xHijos = hijos.map(asignarX);
    const x = xHijos.reduce((suma, v) => suma + v, 0) / xHijos.length;
    xPorId.set(id, x);
    return x;
  };
  for (const raiz of raices) asignarX(raiz);

  const posiciones = new Map<string, PosicionLinaje>();
  for (const [id, x] of xPorId) {
    posiciones.set(id, { x: x * espacioH, y: (profundidadPorId.get(id) ?? 0) * espacioV });
  }

  const aristas: AristaVisible[] = [];
  for (const [id, padre] of padrePorId) {
    if (!padre) continue;
    aristas.push({
      id: `linaje:${padre}->${id}`,
      origenId: padre,
      destinoId: id,
      intensidad: 1,
      tipo: "linaje",
      bidireccional: false,
    });
  }

  return { posiciones, raices, aristas, generacionMaxima };
}
