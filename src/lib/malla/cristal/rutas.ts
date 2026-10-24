// Malla cristalina SiO₂ amorfa: mejores rutas sobre puentes del cristal (Ola 1012Q)
// Función pura: sin node:* ni Supabase ni window

import { viabilidad } from './viabilidad';
import { senalesDeReticula } from './teselas';
import type { Cristal, Reticula, Dato, Medio, SenalMedida } from './tipos';

export interface Ruta {
  saltos: string[];
  medios: Medio[];
  coste: number;
  motivo: string;
}

export function mejoresRutas(
  cristal: Cristal, r: Reticula, dato: Dato,
  ctx: { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean },
  k = 3
): Ruta[] {
  function senalDelPuente(p: { a: string; b: string; medio: Medio; coste: number }): SenalMedida {
    const s = senalesDeReticula(r).find(
      s => ((s.de === p.a && s.a === p.b) || (s.de === p.b && s.a === p.a)) && s.medio === p.medio
    );
    if (s) return s;
    const q = Math.max(0, Math.min(1, 1 - p.coste));
    return { de: p.a, a: p.b, medio: p.medio, rssiDbm: -90 + q * 50, snrDb: -20 + q * 35, rttMs: Math.round((1 - q) * 200), anchoBandaKbps: Math.round(q * 200000), perdidaPct: Math.round((1 - q) * 30), vistaEn: 1 };
  }
  function grafo(): Record<string, { vecino: string; coste: number; medio: Medio }[]> {
    const g: Record<string, { vecino: string; coste: number; medio: Medio }[]> = {};
    for (const p of cristal.puentes) {
      const v = viabilidad(dato, senalDelPuente(p), ctx);
      if (!v.apto || v.valor <= 0) continue;
      const c = 1 - v.valor;
      if (!g[p.a]) g[p.a] = [];
      if (!g[p.b]) g[p.b] = [];
      g[p.a].push({ vecino: p.b, coste: c, medio: p.medio });
      g[p.b].push({ vecino: p.a, coste: c, medio: p.medio });
    }
    return g;
  }
  function corta(g: Record<string, { vecino: string; coste: number; medio: Medio }[]>, inicio: string, destino: string) {
    const visitados = new Set<string>();
    const prev = new Map<string, string>();
    const prevM = new Map<string, Medio>();
    const dist = new Map<string, number>();
    for (const n of new Set([...Object.keys(g), inicio, destino])) dist.set(n, n === inicio ? 0 : Infinity);
    const cola = [...new Set([...Object.keys(g), inicio, destino])].sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    while (cola.length) {
      const u = cola.shift()!;
      if (u === destino) break;
      if (visitados.has(u)) continue;
      visitados.add(u);
      const du = dist.get(u) ?? Infinity;
      for (const a of g[u] || []) {
        if (visitados.has(a.vecino)) continue;
        const alt = du + a.coste;
        if (alt < (dist.get(a.vecino) ?? Infinity)) { dist.set(a.vecino, alt); prev.set(a.vecino, u); prevM.set(a.vecino, a.medio); }
      }
      cola.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    }
    if ((dist.get(destino) ?? Infinity) === Infinity) return null;
    const ruta: string[] = []; const medios: Medio[] = [];
    let cur: string | undefined = destino;
    while (cur !== undefined) { ruta.unshift(cur); const ant = prev.get(cur); if (ant !== undefined) medios.unshift(prevM.get(cur)!); cur = ant; }
    return { saltos: ruta.slice(1), medios, coste: dist.get(destino) ?? Infinity };
  }
  if (dato.destino === null) {
    const vecinos = grafo()[dato.origen] || [];
    return vecinos.map(v => ({ saltos: [v.vecino], medios: [v.medio], coste: v.coste, motivo: `difusión: salto directo a ${v.vecino}` }))
      .sort((a, b) => (a.coste - b.coste) || (a.saltos.length - b.saltos.length) || a.saltos[0].localeCompare(b.saltos[0]));
  }
  const g = grafo();
  const nodos = new Set([...Object.keys(g), dato.origen, dato.destino]);
  if (!nodos.has(dato.origen) || !nodos.has(dato.destino)) return [];
  const A: { saltos: string[]; medios: Medio[]; coste: number }[] = [];
  const B: { saltos: string[]; medios: Medio[]; coste: number }[] = [];
  const p1 = corta(g, dato.origen, dato.destino);
  if (p1) A.push(p1);
  for (let i = 1; i < k; i++) {
    if (A.length < i) break;
    const actual = A[i - 1];
    for (let j = 0; j < actual.saltos.length - 1; j++) {
      const esp = actual.saltos[j];
      for (const ar of g[esp] || []) {
        const des = actual.saltos.slice(0, j + 1);
        const med = actual.medios.slice(0, j + 1);
        if (des.includes(ar.vecino)) continue;
        const sub = JSON.parse(JSON.stringify(g));
        const resto = corta(sub, ar.vecino, dato.destino);
        if (resto && resto.saltos.length > 0) {
          const comb = { saltos: [...des, ar.vecino, ...resto.saltos], medios: [...med, ar.medio, ...resto.medios], coste: actual.coste + ar.coste + resto.coste };
          const dup = A.some(r => JSON.stringify(r.saltos) === JSON.stringify(comb.saltos)) || B.some(r => JSON.stringify(r.saltos) === JSON.stringify(comb.saltos));
          if (!dup) B.push(comb);
        }
      }
    }
    if (!B.length) break;
    B.sort((a, b) => a.coste - b.coste || a.saltos.length - b.saltos.length);
    A.push(B.shift()!);
  }
  A.sort((a, b) => a.coste - b.coste || a.saltos.length - b.saltos.length || a.saltos[0].localeCompare(b.saltos[0]));
  return A.slice(0, k).map((r, idx) => ({ saltos: r.saltos, medios: r.medios, coste: r.coste, motivo: idx === 0 ? 'mejor ruta (Dijkstra)' : `desvío k=${idx}` }));
}
