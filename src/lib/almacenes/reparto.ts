/**
 * Reparto democrático de fragmentos entre nodos — Módulo puro TypeScript.
 *
 * Colocación según ofertas, salud y diversidad (no todo en el mismo aparato, red o persona).
 * Reciprocidad: quien ofrece capacidad gana cupo; reglas de cupo por asamblea (PoliGenesis).
 * Reparación cuando un nodo se va.
 */

export type SaludNodo = "excelente" | "buena" | "regular" | "critica" | "desconocida";

export interface NodoAlmacen {
  /** Identificador único del nodo. */
  id: string;
  /** Identidad de la persona dueña del nodo. */
  personaId: string;
  /** Identidad de la red (ISP, ASN, red local, malla). */
  redId: string;
  /** Identidad del dispositivo físico (serial, MAC, UUID). */
  dispositivoId: string;
  /** Capacidad total en bytes. */
  capacidadBytes: bigint;
  /** Capacidad libre en bytes. */
  libreBytes: bigint;
  /** Salud del nodo (SMART, latencia, disponibilidad histórica). */
  salud: SaludNodo;
  /** Versión del nodo (para detectar cambios). */
  version: number;
}

export interface OfertaAlmacen {
  /** Nodo que hace la oferta. */
  nodoId: string;
  /** Bytes que ofrece para almacenamiento ajeno. */
  bytesOfrecidos: bigint;
  /** Duración de la oferta en milisegundos. */
  duracionMs: number;
  /** Prioridad de la oferta (mayor = más prioritario). */
  prioridad: number;
}

export interface NodoIdentidad {
  personaId: string;
  dispositivoId: string;
  redId: string;
}

export interface RepartoPlan {
  /** Índices de los fragmentos (0 a n-1). */
  fragmentoIndices: number[];
  /** Asignación: índice de fragmento -> nodoId. */
  asignaciones: Map<number, string>;
  /** Parámetro k de Reed-Solomon. */
  k: number;
  /** Parámetro n de Reed-Solomon (réplicas totales). */
  n: number;
}

/** Pesos de salud para scoring. */
const PESOS_SALUD: Record<SaludNodo, number> = {
  excelente: 1.0,
  buena: 0.8,
  regular: 0.5,
  critica: 0.1,
  desconocida: 0.3,
};

/** Obtiene la identidad de diversidad de un nodo. */
export function obtenerIdentidad(nodo: NodoAlmacen): NodoIdentidad {
  return {
    personaId: nodo.personaId,
    dispositivoId: nodo.dispositivoId,
    redId: nodo.redId,
  };
}

/**
 * Calcula la diversidad de un conjunto de nodos (0.0 a 1.0).
 * 1.0 = todos los nodos tienen persona, red y dispositivo distintos.
 * 0.0 = todos los nodos son idénticos en persona, red y dispositivo.
 */
export function calcularDiversidad(nodos: NodoAlmacen[]): number {
  if (nodos.length === 0) return 0;
  if (nodos.length === 1) return 1.0;

  const personas = new Set(nodos.map((n) => n.personaId));
  const redes = new Set(nodos.map((n) => n.redId));
  const dispositivos = new Set(nodos.map((n) => n.dispositivoId));

  const diversidadPersona = personas.size / nodos.length;
  const diversidadRed = redes.size / nodos.length;
  const diversidadDispositivo = dispositivos.size / nodos.length;

  // Promedio ponderado: persona y red son más críticos que dispositivo
  return diversidadPersona * 0.5 + diversidadRed * 0.3 + diversidadDispositivo * 0.2;
}

/**
 * Calcula el score de un nodo para selección (mayor = mejor).
 * Combina salud, capacidad libre, y diversidad respecto a ya seleccionados.
 */
function calcularScoreNodo(
  nodo: NodoAlmacen,
  oferta: OfertaAlmacen,
  yaSeleccionados: NodoAlmacen[]
): number {
  const saludScore = PESOS_SALUD[nodo.salud] ?? 0.3;
  const capacidadScore = Math.min(Number(nodo.libreBytes) / Number(oferta.bytesOfrecidos), 2.0);
  const prioridadScore = Math.min(oferta.prioridad / 10, 1.0);

  // Penalizar si reduce diversidad
  let diversidadPenalty = 1.0;
  if (yaSeleccionados.length > 0) {
    const conNuevo = [...yaSeleccionados, nodo];
    const diversidad = calcularDiversidad(conNuevo);
    diversidadPenalty = 0.5 + diversidad * 0.5; // 0.5 a 1.0
  }

  return saludScore * 0.4 + capacidadScore * 0.3 + prioridadScore * 0.2 + diversidadPenalty * 0.1;
}

/**
 * Selecciona n nodos óptimos de los disponibles según ofertas, salud y diversidad.
 * Lanza error si no hay suficientes nodos con ofertas válidas.
 */
export function seleccionarNodos(
  nodos: NodoAlmacen[],
  ofertas: OfertaAlmacen[],
  n: number,
  k: number
): Array<{ nodoId: string; score: number }> {
  if (n <= k) throw new Error("n debe ser > k");
  if (nodos.length === 0) throw new Error("No hay nodos disponibles");

  // Filtrar nodos que tienen oferta válida y capacidad suficiente
  const ofertasPorNodo = new Map(ofertas.map((o) => [o.nodoId, o]));
  const candidatos = nodos
    .filter((nodo) => {
      const oferta = ofertasPorNodo.get(nodo.id);
      return oferta !== undefined && nodo.libreBytes >= oferta.bytesOfrecidos;
    })
    .map((nodo) => ({
      nodo,
      oferta: ofertasPorNodo.get(nodo.id)!,
    }));

  if (candidatos.length < n) {
    throw new Error(`Nodos insuficientes: ${candidatos.length} disponibles, se necesitan ${n}`);
  }

  // Greedy selection maximizando score con diversidad
  const seleccionados: NodoAlmacen[] = [];
  const resultado: Array<{ nodoId: string; score: number }> = [];

  for (let i = 0; i < n; i++) {
    let mejorCandidato = candidatos[0];
    let mejorScore = -1;

    for (const cand of candidatos) {
      if (seleccionados.some((s) => s.id === cand.nodo.id)) continue;
      const score = calcularScoreNodo(cand.nodo, cand.oferta, seleccionados);
      if (score > mejorScore) {
        mejorScore = score;
        mejorCandidato = cand;
      }
    }

    seleccionados.push(mejorCandidato.nodo);
    resultado.push({ nodoId: mejorCandidato.nodo.id, score: mejorScore });
  }

  return resultado;
}

/**
 * Verifica si un nodo cumple la regla de reciprocidad:
 * lo que consume (almacena en otros) no debe exceder lo que ofrece.
 */
export function verificarReciprocidad(
  nodo: NodoAlmacen,
  ofertasPropias: OfertaAlmacen[],
  bytesConsumidos: bigint
): boolean {
  const totalOfrecido = ofertasPropias
    .filter((o) => o.nodoId === nodo.id)
    .reduce((sum, o) => sum + o.bytesOfrecidos, 0n);

  return totalOfrecido >= bytesConsumidos;
}

/**
 * Calcula la cuota de almacenamiento que cada nodo puede usar en la red
 * basado en su contribución (reciprocidad).
 */
export function calcularCuota(
  ofertas: OfertaAlmacen[],
  demandaTotal: bigint,
  opciones: { maxPorNodo?: bigint } = {}
): Map<string, bigint> {
  const totalOfrecido = ofertas.reduce((sum, o) => sum + o.bytesOfrecidos, 0n);
  if (totalOfrecido === 0n || demandaTotal === 0n) {
    return new Map(ofertas.map((o) => [o.nodoId, 0n]));
  }

  const cuotas = new Map<string, bigint>();
  const maxPorNodo = opciones.maxPorNodo ?? demandaTotal;

  // Primera pasada: calcular cuotas proporcionales
  for (const oferta of ofertas) {
    const proporcion = Number(oferta.bytesOfrecidos) / Number(totalOfrecido);
    let cuota = (demandaTotal * BigInt(Math.floor(proporcion * 10000))) / 10000n;
    if (cuota > maxPorNodo) cuota = maxPorNodo;
    cuotas.set(oferta.nodoId, cuota);
  }

  // Ajustar para que sume exactamente demandaTotal (redistribuir sobrante)
  let suma = Array.from(cuotas.values()).reduce((a, b) => a + b, 0n);
  let diferencia = demandaTotal - suma;

  // Redistribuir diferencia respetando maxPorNodo
  while (diferencia !== 0n) {
    let redistribuido = false;
    for (const oferta of ofertas) {
      if (diferencia === 0n) break;
      const actual = cuotas.get(oferta.nodoId)!;
      if (actual < maxPorNodo) {
        const puedeTomar = maxPorNodo - actual;
        const tomar = diferencia > 0n ? (puedeTomar < diferencia ? puedeTomar : diferencia) : -((-diferencia) < puedeTomar ? -diferencia : puedeTomar);
        if (tomar !== 0n) {
          cuotas.set(oferta.nodoId, actual + tomar);
          diferencia -= tomar;
          redistribuido = true;
        }
      }
    }
    if (!redistribuido) break; // No se puede redistribuir más
  }

  return cuotas;
}

/**
 * Repara un plan de reparto cuando uno o más nodos se caen.
 * Reasigna los fragmentos huérfanos a nodos disponibles manteniendo diversidad.
 */
export function repararReparto(
  planOriginal: RepartoPlan,
  nodosDisponibles: NodoAlmacen[],
  ofertasDisponibles: OfertaAlmacen[],
  nodosCaidos: string[]
): RepartoPlan {
  const asignacionesNuevas = new Map(planOriginal.asignaciones);
  const nodosCaidosSet = new Set(nodosCaidos);

  // Identificar fragmentos huérfanos
  const indicesHuerfanos: number[] = [];
  for (const [indice, nodoId] of asignacionesNuevas) {
    if (nodosCaidosSet.has(nodoId)) {
      indicesHuerfanos.push(indice);
      asignacionesNuevas.delete(indice);
    }
  }

  if (indicesHuerfanos.length === 0) return planOriginal;

  // Nodos ya usados en el plan (excluyendo caídos)
  const nodosEnUso = new Set<string>();
  for (const nodoId of asignacionesNuevas.values()) {
    nodosEnUso.add(nodoId);
  }

  // Candidatos para reparación: disponibles, con oferta, no caídos, no usados (o con espacio)
  const ofertasPorNodo = new Map(ofertasDisponibles.map((o) => [o.nodoId, o]));
  const candidatosReparacion = nodosDisponibles
    .filter((n) => !nodosCaidosSet.has(n.id) && ofertasPorNodo.has(n.id))
    .map((n) => ({ nodo: n, oferta: ofertasPorNodo.get(n.id)! }));

  // Reasignar cada fragmento huérfano
  for (const indice of indicesHuerfanos) {
    // Ordenar candidatos por score (diversidad respecto a asignaciones actuales)
    const asignadosActuales = Array.from(asignacionesNuevas.values())
      .map((id) => nodosDisponibles.find((n) => n.id === id))
      .filter((n): n is NodoAlmacen => n !== undefined);

    candidatosReparacion.sort((a, b) => {
      const scoreA = calcularScoreNodo(a.nodo, a.oferta, asignadosActuales);
      const scoreB = calcularScoreNodo(b.nodo, b.oferta, asignadosActuales);
      return scoreB - scoreA;
    });

    // Asignar al mejor candidato que no cause duplicados
    for (const cand of candidatosReparacion) {
      if (!asignacionesNuevas.has(indice) && !Array.from(asignacionesNuevas.values()).includes(cand.nodo.id)) {
        asignacionesNuevas.set(indice, cand.nodo.id);
        break;
      }
    }
  }

  return {
    ...planOriginal,
    asignaciones: asignacionesNuevas,
  };
}

/**
 * Crea un plan de reparto inicial para n fragmentos entre nodos disponibles.
 */
export function crearPlanReparto(
  nodos: NodoAlmacen[],
  ofertas: OfertaAlmacen[],
  k: number,
  n: number
): RepartoPlan {
  const seleccionados = seleccionarNodos(nodos, ofertas, n, k);
  const asignaciones = new Map<number, string>();

  for (let i = 0; i < n; i++) {
    asignaciones.set(i, seleccionados[i].nodoId);
  }

  return {
    fragmentoIndices: Array.from({ length: n }, (_, i) => i),
    asignaciones,
    k,
    n,
  };
}