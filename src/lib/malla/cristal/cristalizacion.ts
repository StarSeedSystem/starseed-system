import type { Medio, NeuronaReticula, SenalMedida, Tesela, Reticula, EstadoVitreo, Puente, Cristal, Prioridad } from "./tipos";
import { delaunay } from "./triangulacion";
import { costeSenal, CAPACIDAD_KBPS } from "./coste";
import { huellaReticula, senalesDeReticula } from "./teselas";
import { coordinacionDe, claveSenal } from "./tipos";
export type { Cristal, Medio, NeuronaReticula, SenalMedida, Tesela, Reticula, EstadoVitreo, Puente } from "./tipos";
export { coordinacionDe, claveSenal } from "./tipos";

// Constants for medium ranges in meters
const MEDIUM_RANGE: Record<Medio, number> = {
  lora: 15000,
  ble: 50,
  'wifi-lan': 300,
  'wifi-mesh': 300,
  webrtc: 1000000, // effectively unlimited
  reticulum: 10000,
  serie: 10,
  nfc: 0.1,
  servidor: 1000000, // effectively unlimited
};

/**
 * Computes the temperature for each neuron based on signal quality history.
 * @param historial - Array of {clave: string, t: number, calidad: number}
 * @param ventanaMs - Time window in milliseconds (default 120000)
 * @param ahora - Current time in milliseconds
 * @returns Record mapping neuron id to temperature (0-1)
 */
export function temperaturaDe(
  historial: Array<{ clave: string; t: number; calidad: number }>,
  ventanaMs = 120000,
  ahora: number
): Record<string, number> {
  const cutoff = ahora - ventanaMs;
  const groups: Record<string, number[]> = {};
  for (const item of historial) {
    if (item.t >= cutoff && item.t <= ahora) {
      if (!groups[item.clave]) {
        groups[item.clave] = [];
      }
      groups[item.clave].push(item.calidad);
    }
  }
  const result: Record<string, number> = {};
  for (const [clave, calificaciones] of Object.entries(groups)) {
    if (calificaciones.length < 2) {
      result[clave] = 0.5;
      continue;
    }
    const mean =
      calificaciones.reduce((sum, val) => sum + val, 0) / calificaciones.length;
    const variance =
      calificaciones.reduce(
        (sum, val) => sum + Math.pow(val - mean, 2),
        0
      ) / calificaciones.length;
    const std = Math.sqrt(variance);
    // Map std to [0.5, 1.0] where std=0 -> 0.5, std=0.25 -> 1.0, and clamp at 1.0
    const temp = Math.min(1.0, 0.5 + std * 2);
    result[clave] = temp;
  }
  // For neurons not in the histogram, we don't set anything (they will be undefined, but the contract doesn't specify)
  // We'll leave them out; the caller should provide temperature for all neurons if needed.
  return result;
}

/**
 * Determines the vitreous state based on average temperature.
 * @param temperaturaMedia - Average temperature of a neuron
 * @returns EstadoVitreo
 */
export function estadoDe(temperaturaMedia: number): EstadoVitreo {
  if (temperaturaMedia >= 0.6) {
    return 'fundido';
  }
  if (temperaturaMedia >= 0.25) {
    return 'subenfriado';
  }
  return 'vitreo';
}

/**
 * Computes the objective coordination number for a neuron, considering possible defects.
 * @param neurona - The neuron
 * @param temperatura - Temperature of the neuron (0-1)
 * @param mejorCostoRestante - Best remaining candidate cost for the neuron (optional)
 * @returns Objective coordination number (minimum 1)
 */
export function coordinacionObjetivo(
  neurona: NeuronaReticula,
  temperatura: number,
  mejorCostoRestante?: number
): number {
  let base = coordinacionDe(neurona);
  if (temperatura >= 0.6) {
    base += 1;
  }
  if (mejorCostoRestante !== undefined && mejorCostoRestante > 0.7) {
    base -= 1;
  }
  return Math.max(1, base);
}

/**
 * Computes the shared medium with the highest capacity between two neurons.
 * @param mediasA - Media of neuron A
 * @param mediasB - Media of neuron B
 * @returns The medium with the highest capacity, or undefined if none
 */
export function medioCompartidoMaxCapacidad(
  mediasA: Medio[],
  mediasB: Medio[]
): Medio | undefined {
  const setB = new Set(mediasB);
  let best: Medio | undefined = undefined;
  let bestCapacity = -1;
  for (const m of mediasA) {
    if (setB.has(m)) {
      const cap = CAPACIDAD_KBPS[m];
      if (cap > bestCapacity) {
        bestCapacity = cap;
        best = m;
      }
    }
  }
  return best;
}

/**
 * Computes the distance between two points.
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance in meters
 */
export function distancia(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generates candidate bridges from measured signals and Delaunay triangulation.
 * @param r - The retícula
 * @param confianza - Confidence scores for neurons (optional)
 * @returns Array of candidate bridges
 */
export function generarCandidatos(
  r: Reticula,
  confianza: Record<string, number> = {}
): Puente[] {
  // 1. Get all signals from the retícula
  const senales = senalesDeReticula(r);
  const signalExisting = new Set<string>(); // to avoid duplicating the same signal-based candidate
  const pairExisting = new Set<string>(); // pairs (de, a) in canonical order that have at least one signal (any medium)
  const candidatos: Puente[] = [];

  // Helper to get confidence for a neuron
  const getConf = (id: string): number => confianza[id] ?? 1;

  // Add signal-based candidates
  for (const s of senales) {
    const clave = claveSenal(s);
    // Avoid duplicating the same signal-based candidate
    if (!signalExisting.has(clave)) {
      signalExisting.add(clave);
      const conf = (getConf(s.de) + getConf(s.a)) / 2;
      const coste = costeSenal(s, conf);
      candidatos.push({
        a: s.de,
        b: s.a,
        medio: s.medio,
        coste,
      });
    }
    // Mark that this pair (de, a) has at least one signal (any medium)
    const pairKey = s.de < s.a ? `${s.de}|${s.a}` : `${s.a}|${s.de}`;
    pairExisting.add(pairKey);
  }

  // 2. Get all neurons with position
  const neuronasConPosicion: NeuronaReticula[] = [];
  for (const tesela of Object.values(r.teselas)) {
    const n = tesela.neurona;
    if (n.posicion) {
      neuronasConPosicion.push(n);
    }
  }

  // 3. For each pair of neurons with position, check if we can add a Delaunay edge
  for (let i = 0; i < neuronasConPosicion.length; i++) {
    for (let j = i + 1; j < neuronasConPosicion.length; j++) {
      const nA = neuronasConPosicion[i];
      const nB = neuronasConPosicion[j];
      // Skip if there is any signal between this pair (any medium)
      const pairKey = nA.id < nB.id ? `${nA.id}|${nB.id}` : `${nB.id}|${nA.id}`;
      if (pairExisting.has(pairKey)) {
        continue;
      }
      // We'll compute the shared medium with max capacity
      const medioShared = medioCompartidoMaxCapacidad(nA.medios, nB.medios);
      if (!medioShared) {
        continue;
      }
      const dist = distancia(nA.posicion!, nB.posicion!);
      const range = MEDIUM_RANGE[medioShared];
      if (dist > range) {
        continue;
      }
      // Create a fake signal to compute cost? We don't have signal measurements for this pair.
      // We'll assume a default signal with unknown quality -> calidadSenal returns 0.3 (from coste.ts line 45)
      // Then costeSenal = (1 - calidad) + (1 - confianzaNodo) * 0.5
      const conf = (getConf(nA.id) + getConf(nB.id)) / 2;
      const calidadDefault = 0.3; // from coste.ts
      const coste = (1 - calidadDefault) + (1 - conf) * 0.5;
      candidatos.push({
        a: nA.id,
        b: nB.id,
        medio: medioShared,
        coste,
      });
    }
  }

  return candidatos;
}

/**
 * Applies Kruskal's algorithm to select bridges that guarantee connection.
 * @param candidatos - Array of candidate bridges
 * @param neuronasIds - Set of neuron IDs in the retícula
 * @returns Array of selected bridges forming a spanning tree
 */
export function kruskal(
  candidatos: Puente[],
  neuronasIds: Set<string>
): Puente[] {
  // Union-Find data structure
  const parent: Map<string, string> = new Map();
  const rank: Map<string, number> = new Map();

  const find = (x: string): string => {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  };

  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    if (rank.get(rx)! < rank.get(ry)!) {
      parent.set(rx, ry);
    } else if (rank.get(rx)! > rank.get(ry)!) {
      parent.set(ry, rx);
    } else {
      parent.set(ry, rx);
      rank.set(rx, (rank.get(rx)! || 0) + 1);
    }
  };

  // Initialize each neuron as its own set
  for (const id of neuronasIds) {
    parent.set(id, id);
    rank.set(id, 0);
  }
  // Also, for any id in the candidatos that is not in neuronasIds, initialize
  for (const c of candidatos) {
    if (!parent.has(c.a)) {
      parent.set(c.a, c.a);
      rank.set(c.a, 0);
    }
    if (!parent.has(c.b)) {
      parent.set(c.b, c.b);
      rank.set(c.b, 0);
    }
  }

  // Sort candidates by coste, then a, b, medio
  const sorted = [...candidatos].sort((a, b) => {
    if (a.coste !== b.coste) return a.coste - b.coste;
    if (a.a !== b.a) return a.a.localeCompare(b.a);
    if (a.b !== b.b) return a.b.localeCompare(b.b);
    return a.medio.localeCompare(b.medio);
  });

  const result: Puente[] = [];
  for (const puente of sorted) {
    const raizA = find(puente.a);
    const raizB = find(puente.b);
    if (raizA !== raizB) {
      result.push(puente);
      union(puente.a, puente.b);
    }
  }

  return result;
}

/**
 * Adds extra bridges that form triangles while respecting coordination limits.
 * @param puentesPuentes - Current selected bridges (from Kruskal)
 * @param candidatos - All candidate bridges
 * @param neuronas - Map of neuron ID to neuron object
 * @param temperaturas - Temperature of each neuron
 * @param confianzas - Confidence of each neuron
 * @returns Array of bridges after adding triangle-closing ones
 */
export function agregarPuentesTriangulo(
  puentesPuentes: Puente[],
  candidatos: Puente[],
  neuronas: Record<string, NeuronaReticula>,
  temperaturas: Record<string, number>,
  confianzas: Record<string, number>
): Puente[] {
  // Count current bridges per neuron
  const currentCount: Record<string, number> = {};
  for (const p of puentesPuentes) {
    currentCount[p.a] = (currentCount[p.a] || 0) + 1;
    currentCount[p.b] = (currentCount[p.b] || 0) + 1;
  }

  // Compute objective coordination for each neuron
  const objetivo: Record<string, number> = {};
  for (const [id, neurona] of Object.entries(neuronas)) {
    const temp = temperaturas[id] ?? 0.5; // default if not provided
    // We don't have mejorCostoRestante here, so we omit it (undefined)
    objetivo[id] = coordinacionObjetivo(neurona, temp);
  }

  // Create a set of existing bridges in puentesPuentes for quick lookup (to avoid duplicates in candidates)
  const existenteSet = new Set<string>();
  for (const p of puentesPuentes) {
    const key1 = `${p.a}|${p.b}|${p.medio}`;
    const key2 = `${p.b}|${p.a}|${p.medio}`;
    existenteSet.add(key1);
    existenteSet.add(key2);
  }

  // Filter candidates: those not already in puentesPuentes
  const disponibles: Puente[] = [];
  for (const c of candidatos) {
    const key = `${c.a}|${c.b}|${c.medio}`;
    if (!existenteSet.has(key)) {
      disponibles.push(c);
    }
  }

  // Sort disponibles by coste, then a, b, medio
  disponibles.sort((a, b) => {
    if (a.coste !== b.coste) return a.coste - b.coste;
    if (a.a !== b.a) return a.a.localeCompare(b.a);
    if (a.b !== b.b) return a.b.localeCompare(b.b);
    return a.medio.localeCompare(b.medio);
  });

  // Try to add bridges in order
  const result = [...puentesPuentes];
  for (const puente of disponibles) {
    const countA = currentCount[puente.a] || 0;
    const countB = currentCount[puente.b] || 0;
    const objA = objetivo[puente.a] || 1;
    const objB = objetivo[puente.b] || 1;
    if (countA < objA && countB < objB) {
      // Add this bridge
      result.push(puente);
      currentCount[puente.a] = countA + 1;
      currentCount[puente.b] = countB + 1;
    }
  }

  return result;
}

/**
 * Main crystallization function.
 * @param r - The retícula
 * @param opc - Optional confidence and temperature records
 * @returns Cristal object with bridges, state, temperature, huella, and coordination
 */
export function cristalizar(
  r: Reticula,
  opc: {
    confianza?: Record<string, number>;
    temperatura?: Record<string, number>;
  } = {}
): Cristal {
  const confianza = opc.confianza ?? {};
  const temperatura = opc.temperatura ?? {};

  // 1. Get all neuron IDs from the retícula
  const neuronasIds: Set<string> = new Set();
  const neuronas: Record<string, NeuronaReticula> = {};
  for (const tesela of Object.values(r.teselas)) {
    const id = tesela.neurona.id;
    neuronasIds.add(id);
    neuronas[id] = tesela.neurona;
  }

  // 2. Generate candidate bridges
  const candidatos = generarCandidatos(r, confianza);

  // 3. Apply Kruskal to get base bridges (spanning tree)
  const puentesBase = kruskal(candidatos, neuronasIds);

  // 4. Add extra bridges that form triangles
  const puentesFinal = agregarPuentesTriangulo(
    puentesBase,
    candidatos,
    neuronas,
    temperatura,
    confianza
  );

  // 5. Compute average temperature for estado
  let sumaTemp = 0;
  let countTemp = 0;
  for (const id of neuronasIds) {
    const temp = temperatura[id];
    if (temp !== undefined) {
      sumaTemp += temp;
      countTemp++;
    }
  }
  const mediaTemp = countTemp > 0 ? sumaTemp / countTemp : 0.5;
  const estado = estadoDe(mediaTemp);

  // 6. Compute huella
  const huellaBase = huellaReticula(r);
  const huella = huellaBase + ':' + puentesFinal.length;

  // 7. Compute coordination per neuron (number of bridges they have)
  const coordinacion: Record<string, number> = {};
  for (const id of neuronasIds) {
    coordinacion[id] = 0;
  }
  for (const p of puentesFinal) {
    coordinacion[p.a] = (coordinacion[p.a] || 0) + 1;
    coordinacion[p.b] = (coordinacion[p.b] || 0) + 1;
  }

  return {
    puentes: puentesFinal,
    estado,
    temperatura, // we return the input temperatura record (or empty)
    huella,
    coordinacion,
  };
}