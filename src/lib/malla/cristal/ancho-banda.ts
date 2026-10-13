// Malla cristalina SiO₂ amorfa: reparto de ancho de banda ponderado
// Función pura: sin node:* ni Supabase ni window

import { Prioridad } from "./tipos";

interface Flujo {
  id: string;
  prioridad: Prioridad;
  demandaKbps: number;
  enlaces: string[];
}

// Weight for each priority level: P0 gets highest weight
const PESO_POR_PRIORIDAD: Record<Prioridad, number> = {
  0: 8, // P0
  1: 4, // P1
  2: 2, // P2
  3: 1, // P3
};

export function repartirAnchoBanda(
  flujos: Flujo[],
  capacidades: Record<string, number>
): Record<string, number> {
  // Initialize allocations
  const asignaciones: Record<string, number> = {};
  for (const f of flujos) asignaciones[f.id] = 0;

  // Map links to flows
  const flujosPorEnlace: Record<string, string[]> = {};
  for (const f of flujos)
    for (const e of f.enlaces)
      (flujosPorEnlace[e] || (flujosPorEnlace[e] = [])).push(f.id);

  // Unsatisfied flows
  const insatisfechos = new Set(flujos.map(f => f.id));

  // Main allocation loop
  while (insatisfechos.size) {
    // Remaining capacity per link
    const rest: Record<string, number> = {};
    for (const [e, cap] of Object.entries(capacidades)) {
      let used = 0;
      (flujosPorEnlace[e] || []).forEach(fid => used += asignaciones[fid]);
      rest[e] = Math.max(0, cap - used);
    }

    // Sum of weights per link (only unsatisfied flows)
    const pesoSum: Record<string, number> = {};
    for (const [e, fids] of Object.entries(flujosPorEnlace)) {
      let sum = 0;
      for (const fid of fids) {
        if (insatisfechos.has(fid)) {
          const f = flujos.find(f => f.id === fid);
          if (f) sum += PESO_POR_PRIORIDAD[f.prioridad];
        }
      }
      pesoSum[e] = sum;
    }

    // Max increase per flow (delta)
    const delta: Record<string, number> = {};
    for (const fid of Array.from(insatisfechos)) {
      const f = flujos.find(f => f.id === fid);
      if (!f) continue;

      // Find bottleneck link rate
      let minRate = Infinity;
      for (const e of f.enlaces) {
        const weightSum = pesoSum[e] || 0;
        if (weightSum > 0) {
          const rate = rest[e] / weightSum;
          if (rate < minRate) minRate = rate;
        }
      }

      // Calculate feasible increase
      const maxInc = minRate * PESO_POR_PRIORIDAD[f.prioridad];
      const remDemand = f.demandaKbps - asignaciones[fid];
      delta[fid] = Math.min(maxInc, remDemand);
    }

    // Find max lambda: lambda = min(delta_i / weight_i)
    let lambda = Infinity;
    for (const fid of Array.from(insatisfechos)) {
      const f = flujos.find(f => f.id === fid);
      if (!f) continue;
      const weight = PESO_POR_PRIORIDAD[f.prioridad];
      if (weight > 0) {
        const l = delta[fid] / weight;
        if (l < lambda) lambda = l;
      }
    }

    // If no progress, break
    if (!isFinite(lambda) || lambda <= 0) break;

    // Apply allocations
    for (const fid of Array.from(insatisfechos)) {
      const f = flujos.find(f => f.id === fid);
      if (!f) continue;

      const inc = lambda * PESO_POR_PRIORIDAD[f.prioridad];
      asignaciones[fid] = Math.min(asignaciones[fid] + inc, f.demandaKbps);

      // Remove satisfied flows
      if (asignaciones[fid] >= f.demandaKbps) insatisfechos.delete(fid);
    }
  }

  return asignaciones;
}