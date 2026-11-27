/**
 * Reparto democrático de fragmentos entre nodos de almacenamiento
 *
 * Principios:
 * - Colocación según ofertas, salud y diversidad
 * - No todo en el mismo aparato, red o persona
 * - Reparación automática cuando un nodo se va
 * - Cupo por reciprocidad: quien ofrece capacidad gana cupo
 */

export class RepartoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepartoError";
  }
}

/** Nodo de almacenamiento en la malla */
export interface NodoAlmacen {
  /** Identificador único del nodo */
  id: string;
  /** Persona/entidad que controla el nodo */
  personaId: string;
  /** Red a la que pertenece el nodo */
  redId: string;
  /** Dispositivo físico único */
  dispositivoId: string;
  /** Capacidad total en bytes */
  capacidadTotalBytes: bigint;
  /** Capacidad disponible en bytes */
  capacidadDisponibleBytes: bigint;
  /** Estado de salud del disco/nodo */
  salud: "excelente" | "buena" | "regular" | "critica" | "desconocida";
  /** Latencia de red en ms */
  latenciaMs: number;
  /** Ancho de banda en Mbps */
  anchoBandaMbps: number;
  /** Reputación 0-1 (basada en historial de disponibilidad) */
  reputacion: number;
  /** Fecha desde cuando ofrece capacidad */
  ofreciendoDesde: string;
}

/** Oferta de almacenamiento de una persona */
export interface OfertaAlmacenamiento {
  personaId: string;
  bytesOfrecidos: bigint;
}

/** Política de diversidad para colocación */
export interface PoliticaDiversidad {
  /** Máximo de fragmentos en el mismo dispositivo físico */
  maxPorDispositivo: number;
  /** Máximo de fragmentos en la misma red */
  maxPorRed: number;
  /** Máximo de fragmentos bajo la misma persona */
  maxPorPersona: number;
}

/** Asignación de un fragmento a un nodo */
export interface AsignacionFragmento {
  nodoId: string;
  fragmentosAsignados: number;
  indiceFragmento: number;
}

/** Resultado de selección de nodos */
export interface ResultadoSeleccion {
  nodosSeleccionados: AsignacionFragmento[];
  puntuaciones: Map<string, number>;
}

/** Resultado de reparación */
export interface ResultadoReparacion {
  nuevasAsignaciones: AsignacionFragmento[];
  fragmentoReasignados: number[];
}

/** Opciones para cálculo de cuota */
export interface OpcionesCuota {
  /** Mínimo garantizado por persona (bytes) */
  minimoGarantizado?: bigint;
}

/** Factor de peso para cada criterio de puntuación */
const PESOS = {
  capacidad: 0.35,
  salud: 0.25,
  latencia: 0.15,
  anchoBanda: 0.1,
  reputacion: 0.15,
} as const;

/** Multiplicador por nivel de salud */
const SALUD_MULTIPLICADOR = {
  excelente: 1.0,
  buena: 0.85,
  regular: 0.6,
  critica: 0.2,
  desconocida: 0.5,
} as const;

/**
 * Calcula la puntuación de un nodo para almacenar fragmentos
 * @param nodo Nodo a evaluar
 * @param bytesNecesarios Bytes que se necesitan almacenar en este nodo
 * @returns Puntuación 0-1 (0 = no apto, 1 = ideal)
 */
export function calcularPuntuacionNodo(nodo: NodoAlmacen, bytesNecesarios: bigint): number {
  // Capacidad insuficiente = puntuación 0
  if (nodo.capacidadDisponibleBytes < bytesNecesarios) {
    return 0;
  }

  // Factor capacidad: proporción de capacidad disponible vs necesaria (cap a 1)
  const ratioCapacidad = Number(nodo.capacidadDisponibleBytes / bytesNecesarios);
  const factorCapacidad = Math.min(1, ratioCapacidad / 10); // Saturación a 10x lo necesario

  // Factor salud
  const factorSalud = SALUD_MULTIPLICADOR[nodo.salud] ?? 0.5;

  // Factor latencia: mejor latencia = mayor puntuación (logarítmica)
  const factorLatencia = nodo.latenciaMs <= 0 ? 1 : Math.max(0, 1 - Math.log10(nodo.latenciaMs + 1) / 3);

  // Factor ancho de banda: más ancho de banda = mejor (logarítmica, saturación a 1000 Mbps)
  const factorAnchoBanda = Math.min(1, Math.log10(nodo.anchoBandaMbps + 1) / 3);

  // Factor reputación: directo 0-1
  const factorReputacion = Math.max(0, Math.min(1, nodo.reputacion));

  // Puntuación ponderada
  const puntuacion =
    PESOS.capacidad * factorCapacidad +
    PESOS.salud * factorSalud +
    PESOS.latencia * factorLatencia +
    PESOS.anchoBanda * factorAnchoBanda +
    PESOS.reputacion * factorReputacion;

  return Math.max(0, Math.min(1, puntuacion));
}

/**
 * Selecciona los mejores nodos para distribuir fragmentos
 * @param nodos Lista de nodos candidatos
 * @param totalFragmentos Número total de fragmentos a colocar (n)
 * @param k Número mínimo para reconstruir
 * @param fragmentosPorNodo Cuántos fragmentos por nodo (default 1)
 * @param politica Política de diversidad (opcional)
 * @returns Asignación de fragmentos a nodos
 */
export function seleccionarNodos(
  nodos: NodoAlmacen[],
  totalFragmentos: number,
  k: number,
  fragmentosPorNodo: number = 1,
  politica?: PoliticaDiversidad
): ResultadoSeleccion {
  if (totalFragmentos <= 0) {
    throw new RepartoError("totalFragmentos debe ser positivo");
  }
  if (k <= 0 || k > totalFragmentos) {
    throw new RepartoError("k debe ser > 0 y <= totalFragmentos");
  }
  if (fragmentosPorNodo <= 0) {
    throw new RepartoError("fragmentosPorNodo debe ser positivo");
  }

  // Calcular bytes por fragmento (estimación: asumimos datos de ~1GB para puntuación)
  const bytesPorFragmento = BigInt(1_000_000_000); // 1 GB base
  const bytesNecesariosPorNodo = bytesPorFragmento * BigInt(fragmentosPorNodo);

  // Calcular puntuación para cada nodo
  const puntuaciones = new Map<string, number>();
  const nodosConPuntuacion = nodos
    .map((nodo) => ({
      nodo,
      puntuacion: calcularPuntuacionNodo(nodo, bytesNecesariosPorNodo),
    }))
    .filter((np) => np.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion);

  if (nodosConPuntuacion.length === 0) {
    throw new RepartoError("Ningún nodo tiene capacidad suficiente");
  }

  // Seleccionar nodos respetando diversidad
  const seleccionados: AsignacionFragmento[] = [];
  const contadores = {
    porDispositivo: new Map<string, number>(),
    porRed: new Map<string, number>(),
    porPersona: new Map<string, number>(),
  };

  const maxPorDispositivo = politica?.maxPorDispositivo ?? totalFragmentos;
  const maxPorRed = politica?.maxPorRed ?? totalFragmentos;
  const maxPorPersona = politica?.maxPorPersona ?? totalFragmentos;

  let indiceFragmento = 0;

  for (const { nodo, puntuacion } of nodosConPuntuacion) {
    if (seleccionados.length >= totalFragmentos) break;

    // Verificar límites de diversidad
    const enDispositivo = contadores.porDispositivo.get(nodo.dispositivoId) ?? 0;
    const enRed = contadores.porRed.get(nodo.redId) ?? 0;
    const enPersona = contadores.porPersona.get(nodo.personaId) ?? 0;

    if (enDispositivo >= maxPorDispositivo) continue;
    if (enRed >= maxPorRed) continue;
    if (enPersona >= maxPorPersona) continue;

    // Asignar fragmentos a este nodo
    const fragmentosAAsignar = Math.min(fragmentosPorNodo, totalFragmentos - seleccionados.length);
    for (let i = 0; i < fragmentosAAsignar; i++) {
      seleccionados.push({
        nodoId: nodo.id,
        fragmentosAsignados: 1,
        indiceFragmento: indiceFragmento++,
      });
    }

    // Actualizar contadores
    contadores.porDispositivo.set(nodo.dispositivoId, enDispositivo + fragmentosAAsignar);
    contadores.porRed.set(nodo.redId, enRed + fragmentosAAsignar);
    contadores.porPersona.set(nodo.personaId, enPersona + fragmentosAAsignar);

    puntuaciones.set(nodo.id, puntuacion);
  }

  if (seleccionados.length < totalFragmentos) {
    throw new RepartoError(
      `No se pudieron seleccionar ${totalFragmentos} nodos (solo ${seleccionados.length} disponibles con diversidad)`
    );
  }

  // Verificar que tenemos al menos k nodos distintos (para reconstrucción)
  const nodosDistintos = new Set(seleccionados.map((s) => s.nodoId)).size;
  if (nodosDistintos < k) {
    throw new RepartoError(`Diversidad insuficiente: solo ${nodosDistintos} nodos distintos, se necesitan al menos ${k}`);
  }

  return { nodosSeleccionados: seleccionados, puntuaciones };
}

/**
 * Verifica si un conjunto de nodos cumple la política de diversidad
 */
export function verificarDiversidad(nodos: NodoAlmacen[], politica: PoliticaDiversidad): boolean {
  const contadores = {
    porDispositivo: new Map<string, number>(),
    porRed: new Map<string, number>(),
    porPersona: new Map<string, number>(),
  };

  for (const nodo of nodos) {
    const d = (contadores.porDispositivo.get(nodo.dispositivoId) ?? 0) + 1;
    const r = (contadores.porRed.get(nodo.redId) ?? 0) + 1;
    const p = (contadores.porPersona.get(nodo.personaId) ?? 0) + 1;

    if (d > politica.maxPorDispositivo) return false;
    if (r > politica.maxPorRed) return false;
    if (p > politica.maxPorPersona) return false;

    contadores.porDispositivo.set(nodo.dispositivoId, d);
    contadores.porRed.set(nodo.redId, r);
    contadores.porPersona.set(nodo.personaId, p);
  }

  return true;
}

/**
 * Repara el reparto cuando uno o más nodos se caen
 * @param asignacionOriginal Asignaciones actuales
 * @param nodosDisponibles Nodos que siguen vivos
 * @param nodosCaidos IDs de nodos que se cayeron
 * @param totalFragmentos Total de fragmentos (n)
 * @param k Mínimo para reconstruir
 * @returns Nueva asignación con fragmentos reasignados
 */
export function repararReparto(
  asignacionOriginal: AsignacionFragmento[],
  nodosDisponibles: NodoAlmacen[],
  nodosCaidos: string[],
  totalFragmentos: number,
  k: number
): ResultadoReparacion {
  const caidosSet = new Set(nodosCaidos);
  const vivosMap = new Map(nodosDisponibles.map((n) => [n.id, n]));

  // Separar asignaciones vivas y huérfanas
  const asignacionesVivas = asignacionOriginal.filter((a) => !caidosSet.has(a.nodoId));
  const fragmentosHuerfanos = asignacionOriginal.filter((a) => caidosSet.has(a.nodoId));

  if (fragmentosHuerfanos.length === 0) {
    return { nuevasAsignaciones: asignacionOriginal, fragmentoReasignados: [] };
  }

  // Calcular capacidad disponible en nodos vivos (restando lo que ya tienen)
  const cargaActual = new Map<string, number>();
  for (const a of asignacionesVivas) {
    cargaActual.set(a.nodoId, (cargaActual.get(a.nodoId) ?? 0) + a.fragmentosAsignados);
  }

  // Candidatos para recibir fragmentos huérfanos
  const candidatos = nodosDisponibles
    .filter((n) => !caidosSet.has(n.id))
    .map((nodo) => {
      const carga = cargaActual.get(nodo.id) ?? 0;
      const puntuacion = calcularPuntuacionNodo(nodo, BigInt(1_000_000_000)); // 1 GB por fragmento
      return { nodo, puntuacion, carga };
    })
    .filter((c) => c.puntuacion > 0)
    .sort((a, b) => {
      // Preferir menor carga, luego mayor puntuación
      if (a.carga !== b.carga) return a.carga - b.carga;
      return b.puntuacion - a.puntuacion;
    });

  // Reasignar fragmentos huérfanos
  const nuevasAsignaciones = [...asignacionesVivas];
  const reasignados: number[] = [];

  for (const huerfano of fragmentosHuerfanos) {
    // Buscar mejor candidato que respete diversidad
    let asignado = false;
    for (const cand of candidatos) {
      // Verificar diversidad si agregamos este fragmento
      const nodo = cand.nodo;
      const temporales = [...nuevasAsignaciones, { nodoId: nodo.id, fragmentosAsignados: 1, indiceFragmento: huerfano.indiceFragmento }];
      const nodosTemp = temporales.map((a) => vivosMap.get(a.nodoId)!).filter(Boolean);

      // Política de diversidad conservadora para reparación
      const politica: PoliticaDiversidad = { maxPorDispositivo: 2, maxPorRed: 3, maxPorPersona: 3 };
      if (verificarDiversidad(nodosTemp, politica)) {
        nuevasAsignaciones.push({
          nodoId: nodo.id,
          fragmentosAsignados: 1,
          indiceFragmento: huerfano.indiceFragmento,
        });
        cand.carga++;
        reasignados.push(huerfano.indiceFragmento);
        asignado = true;
        break;
      }
    }

    if (!asignado) {
      // Fallback: asignar al mejor puntuado aunque viole diversidad (mejor que perder datos)
      const mejor = candidatos[0];
      if (mejor) {
        nuevasAsignaciones.push({
          nodoId: mejor.nodo.id,
          fragmentosAsignados: 1,
          indiceFragmento: huerfano.indiceFragmento,
        });
        reasignados.push(huerfano.indiceFragmento);
      }
    }
  }

  // Verificar que tenemos al menos k nodos distintos
  const nodosDistintos = new Set(nuevasAsignaciones.map((a) => a.nodoId)).size;
  if (nodosDistintos < k) {
    throw new RepartoError(`Reparación fallida: diversidad insuficiente (${nodosDistintos} nodos, mínimo ${k})`);
  }

  return { nuevasAsignaciones, fragmentoReasignados: reasignados };
}

/**
 * Calcula la cuota de almacenamiento por reciprocidad
 * @param ofertas Ofertas de cada persona
 * @param capacidadTotalDisponible Capacidad total a repartir
 * @param opciones Opciones (mínimo garantizado)
 * @returns Map personaId -> bytes de cuota
 */
export function calcularCuotaReciprocidad(
  ofertas: OfertaAlmacenamiento[],
  capacidadTotalDisponible: bigint,
  opciones: OpcionesCuota = {}
): Map<string, bigint> {
  const { minimoGarantizado = 0n } = opciones;

  // Filtrar ofertas válidas
  const ofertasValidas = ofertas.filter((o) => o.bytesOfrecidos > 0n);
  const totalOfrecido = ofertasValidas.reduce((sum, o) => sum + o.bytesOfrecidos, 0n);

  const cuotas = new Map<string, bigint>();

  // Inicializar con mínimo garantizado
  for (const oferta of ofertas) {
    cuotas.set(oferta.personaId, minimoGarantizado);
  }

  if (totalOfrecido === 0n) {
    return cuotas;
  }

  // Reparto proporcional al resto
  const capacidadParaRepartir = capacidadTotalDisponible > minimoGarantizado * BigInt(ofertas.length)
    ? capacidadTotalDisponible - minimoGarantizado * BigInt(ofertas.length)
    : 0n;

  for (const oferta of ofertasValidas) {
    const proporcion = oferta.bytesOfrecidos / totalOfrecido;
    const cuotaAdicional = (capacidadParaRepartir * oferta.bytesOfrecidos) / totalOfrecido;
    cuotas.set(oferta.personaId, (cuotas.get(oferta.personaId) ?? 0n) + cuotaAdicional);
  }

  return cuotas;
}