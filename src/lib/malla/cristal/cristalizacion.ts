// Malla cristalina SiO₂ amorfa: cristalización
// Funciones puras, sin node:* ni Supabase

import { senalesDeReticula } from "./teselas";
import { delaunay } from "./triangulacion";
import type { 
  NeuronaReticula, 
  SenalMedida, 
  Tesela, 
  Reticula, 
  Medio, 
  EstadoVitreo, 
  Puente, 
  Cristal 
} from "./tipos";
import { huellaReticula } from "./teselas";

export function temperaturaDe(historial: Array<{clave: string; t: number; calidad: number}>, ventanaMs = 120000, ahora: number): Record<string, number> {
  // Get all distinct claves from historial
  const claves = new Set<string>();
  for (const h of historial) {
    claves.add(h.clave);
  }
  const byClave: Record<string, number[]> = {};
  for (const h of historial) {
    if (ahora - h.t <= ventanaMs) {
      byClave[h.clave] = [...(byClave[h.clave] ?? []), h.calidad];
    }
  }
  const result: Record<string, number> = {};
  for (const clave of claves) {
    const calidades = byClave[clave] ?? [];
    if (calidades.length === 0) {
      result[clave] = 0.5;
      continue;
    }
    const mean = calidades.reduce((sum, c) => sum + c, 0) / calidades.length;
    const variance = calidades.reduce((sum, c) => sum + (c - mean) ** 2, 0) / calidades.length;
    const std = Math.sqrt(variance);
    // Map std to [0,1] by std * 2, clamp to [0,1]
    let temperature = std * 2;
    if (temperature > 1) temperature = 1;
    result[clave] = temperature;
  }
  return result;
}

export function estadoDe(temperaturaMedia: number): EstadoVitreo {
  if (temperaturaMedia >= 0.6) return 'fundido';
  if (temperaturaMedia >= 0.25) return 'subenfriado';
  return 'vitreo';
}

export function cristalizar(r: Reticula, opc: {confianza?: Record<string, number>; temperatura?: Record<string, number>} = {}): Cristal {
  // 0. Prepare data
  const neurons: Map<string, NeuronaReticula> = new Map();
  for (const tesela of Object.values(r.teselas)) {
    neurons.set(tesela.neurona.id, tesela.neurona);
  }
  const neuronIds = Array.from(neurons.keys());
  
  // 1. Compute temperature for each neuron (from opc or default 0.5)
  const temperatura: Record<string, number> = {};
  for (const id of neuronIds) {
    temperatura[id] = opc.temperatura?.[id] ?? 0.5;
  }
  
  // 2. Compute base coordination and objective for each neuron
  const coordinacionBase: Record<string, number> = {};
  const objetivoCoordinacion: Record<string, number> = {};
  for (const id of neuronIds) {
    const n = neurons.get(id)!;
    const base = n.esRouter === true ? 6 : 
      n.capacidad.bateriaPct !== null && n.capacidad.bateriaPct < 20 && !n.capacidad.cargando ? 2 :
      n.capacidad.ramGb < 2 ? 3 : 4;
    coordinacionBase[id] = base;
    
    // Defecto por temperatura: +1 si fundido (temperatura >= 0.6)
    let obj = base;
    if (temperatura[id] >= 0.6) obj += 1;
    
    // Defecto por mejor candidato restante: -1 si su mejor candidato restante cuesta > 0.7
    // We'll compute the minimum cost of any candidate edge incident to this neuron later
    // For now, we'll set defect to 0 and adjust after we have candidate costs
    objetivoCoordinacion[id] = Math.max(obj, 1); // minimum 1
  }
  
  // 3. Generate candidate edges from measured signals
  const senales = senalesDeReticula(r);
  const señalCandidates: Puente[] = [];
  for (const s of senales) {
    const coste = costeSenal(s);
    señalCandidates.push({ a: s.de, b: s.a, medio: s.medio, coste });
  }
  
  // 4. Generate candidate edges from Delaunay triangulation
  const puntos: { id: string; x: number; y: number }[] = [];
  for (const id of neuronIds) {
    const n = neurons.get(id)!;
    if (n.posicion) {
      puntos.push({ id, x: n.posicion.x, y: n.posicion.y });
    }
  }
  const delaunayEdges = delaunay(puntos);
  const delaunayCandidates: Puente[] = [];
  for (const [aId, bId] of delaunayEdges) {
    const neuronA = neurons.get(aId)!;
    const neuronB = neurons.get(bId)!;
    const distancia = Math.hypot(
      neuronA.posicion!.x - neuronB.posicion!.x,
      neuronA.posicion!.y - neuronB.posicion!.y
    );
    // Determine shared medios with reach for this distance
    const sharedMedios: Medio[] = [];
    for (const medio of neuronA.medios) {
      if (neuronB.medios.includes(medio)) {
        const alcance = alcanceMedio(medio);
        if (alcance !== null && distancia <= alcance) {
          sharedMedios.push(medio);
        }
      }
    }
    if (sharedMedios.length === 0) continue;
    // Choose medio with highest capacity
    const mejorMedio = sharedMedios.reduce((best, m) => 
      capacidadMedio(m) > capacidadMedio(best) ? m : best
    , sharedMedios[0]);
    delaunayCandidates.push({ a: aId, b: bId, medio: mejorMedio, coste: 0.8 });
  }
  
  // 5. Combine all candidates
  const allCandidates = [...señalCandidates, ...delaunayCandidates];
  
  // 6. Compute incident edge costs for each neuron (for defecto por mejor candidato)
  const incidentCosts: Record<string, number[]> = {};
  for (const c of allCandidates) {
    incidentCosts[c.a] = [...(incidentCosts[c.a] ?? []), c.coste];
    incidentCosts[c.b] = [...(incidentCosts[c.b] ?? []), c.coste];
  }
  for (const id of neuronIds) {
    const costs = incidentCosts[id] ?? [];
    const minCost = costs.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...costs);
    if (minCost > 0.7) {
      objetivoCoordinacion[id] = Math.max(objetivoCoordinacion[id] - 1, 1);
    }
  }
  
  // 7. Sort candidates by cost, then a, b, medio
  allCandidates.sort((p, q) => {
    if (p.coste !== q.coste) return p.coste - q.coste;
    if (p.a !== q.a) return p.a.localeCompare(q.a);
    if (p.b !== q.b) return p.b.localeCompare(q.b);
    if (p.medio !== q.medio) return p.medio.localeCompare(q.medio);
    return 0;
  });
  
  // 8. Kruskal to build initial forest (spanning forest)
  const parent: Record<string, string> = {};
  const rank: Record<string, number> = {};
  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x: string, y: string): boolean {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return false;
    if (rank[rx] < rank[ry]) {
      parent[rx] = ry;
    } else if (rank[rx] > rank[ry]) {
      parent[ry] = rx;
    } else {
      parent[ry] = rx;
      rank[rx] += 1;
    }
    return true;
  }
  for (const id of neuronIds) {
    parent[id] = id;
    rank[id] = 0;
  }
  const forestEdges: Puente[] = [];
  const adj: Record<string, Set<string>> = {}; // adjacency list of the forest
  for (const id of neuronIds) {
    adj[id] = new Set();
  }
  
  for (const edge of allCandidates) {
    if (union(edge.a, edge.b)) {
      forestEdges.push(edge);
      adj[edge.a].add(edge.b);
      adj[edge.b].add(edge.a);
    }
  }
  
  // 9. Prepare for triangle addition: remaining candidates
  const remainingCandidates = allCandidates.filter(edge => 
    !forestEdges.some(e => e.a === edge.a && e.b === edge.b && e.medio === edge.medio && e.coste === edge.coste)
  );
  
  // 10. Sort remaining candidates by same criteria
  remainingCandidates.sort((p, q) => {
    if (p.coste !== q.coste) return p.coste - q.coste;
    if (p.a !== q.a) return p.a.localeCompare(q.a);
    if (p.b !== q.b) return p.b.localeCompare(q.b);
    if (p.medio !== q.medio) return p.medio.localeCompare(q.medio);
    return 0;
  });
  
  // 11. Try to add edges that form triangles and respect coordination objective
  const grado: Record<string, number> = {};
  for (const id of neuronIds) {
    grado[id] = 0;
  }
  // Initialize degree from forest edges
  for (const edge of forestEdges) {
    grado[edge.a] = (grado[edge.a] ?? 0) + 1;
    grado[edge.b] = (grado[edge.b] ?? 0) + 1;
  }
  
  for (const edge of remainingCandidates) {
    const { a, b } = edge;
    // Check if both neurons are below their coordination objective
    if (grado[a] >= objetivoCoordinacion[a] || grado[b] >= objetivoCoordinacion[b]) {
      continue;
    }
    // Check if there is a common neighbor (triangle condition)
    let hasCommon = false;
    for (const neighbor of adj[a]) {
      if (adj[b].has(neighbor)) {
        hasCommon = true;
        break;
      }
    }
    if (!hasCommon) continue;
    // Add the edge
    forestEdges.push(edge);
    adj[a].add(b);
    adj[b].add(a);
    grado[a] = (grado[a] ?? 0) + 1;
    grado[b] = (grado[b] ?? 0) + 1;
  }
  
  // 12. Compute average temperature for estado
  const avgTemp = neuronIds.reduce((sum, id) => sum + temperatura[id], 0) / neuronIds.length;
  const estado = estadoDe(avgTemp);
  
  // 13. Build result
  const huella = huellaReticula(r);
  const coordinacion: Record<string, number> = {};
  for (const id of neuronIds) {
    coordinacion[id] = grado[id] ?? 0;
  }
  
  return {
    puentes: forestEdges,
    estado,
    temperatura,
    huella,
    coordinacion
  };
}

// Helper functions
function costeSenal(s: SenalMedida): number {
  // Compute quality from available metrics, then cost = 1 - quality
  let qualitySum = 0;
  let count = 0;
  
  if (typeof s.rssiDbm === 'number') {
    // Assume range -100 (worst) to -40 (best)
    const q = (s.rssiDbm + 100) / 60;
    qualitySum += Math.max(0, Math.min(1, q));
    count++;
  }
  if (typeof s.snrDb === 'number') {
    // Assume range 0 (worst) to 40 (best)
    const q = s.snrDb / 40;
    qualitySum += Math.max(0, Math.min(1, q));
    count++;
  }
  if (typeof s.rttMs === 'number') {
    // Assume range 2000ms (worst) to 0ms (best)
    const q = 1 - s.rttMs / 2000;
    qualitySum += Math.max(0, Math.min(1, q));
    count++;
  }
  if (typeof s.perdidaPct === 'number') {
    // Assume range 100% (worst) to 0% (best)
    const q = 1 - s.perdidaPct / 100;
    qualitySum += Math.max(0, Math.min(1, q));
    count++;
  }
  if (typeof s.anchoBandaKbps === 'number') {
    // Assume range 0 (worst) to 10000 kbps (best)
    const q = s.anchoBandaKbps / 10000;
    qualitySum += Math.max(0, Math.min(1, q));
    count++;
  }
  
  const quality = count === 0 ? 0.5 : qualitySum / count;
  return 1 - quality;
}

function alcanceMedio(m: Medio): number | null {
  const alcance: Record<Medio, number> = {
    lora: 15000,
    'wifi-lan': 300,
    ble: 50,
  };
  return alcance[m] ?? null;
}

function capacidadMedio(m: Medio): number {
  const capacidad: Record<Medio, number> = {
    lora: 0.3, // kbps
    'wifi-lan': 54000, // kbps
    ble: 2000, // kbps
    // For other medios, we assign a default capacity (not used in Delaunay step per contract, but safe)
    webrtc: 100000,
    'wifi-mesh': 54000,
    reticulum: 1000,
    serie: 100,
    servidor: 1000000,
    nfc: 0.1,
  };
  return capacidad[m];
}