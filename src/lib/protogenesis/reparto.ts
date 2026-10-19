import type { Paso, Plan } from "./encargo";
import type { Ambito, Computo } from "@/lib/protomolecula/tipos";

export type EstadoPaso = 'pendiente' | 'en-curso' | 'verificando' | 'hecho' | 'fallido' | 'necesita-mano';

export function nivelesDe(plan: Plan): string[][] {
  const { pasos } = plan;
  if (!pasos.length) return [];
  const adj = new Map<string, string[]>(), inDeg = new Map<string, number>();
  for (const p of pasos) { adj.set(p.id, []); inDeg.set(p.id, 0); }
  for (const p of pasos)
    for (const d of p.depende)
      if (adj.has(d)) { adj.get(d)!.push(p.id); inDeg.set(p.id, (inDeg.get(p.id) ?? 0) + 1); }
  const levels: string[][] = [], queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);
  while (queue.length) {
    const lv: string[] = [];
    for (let i = 0, n = queue.length; i < n; i++) {
      const v = queue.shift()!;
      lv.push(v);
      for (const nb of adj.get(v)!) {
        const d = (inDeg.get(nb) ?? 0) - 1;
        inDeg.set(nb, d);
        if (d === 0) queue.push(nb);
      }
    }
    lv.sort();
    levels.push(lv);
  }
  return levels;
}

export function pasosListos(plan: Plan, estados: Record<string, EstadoPaso>): Paso[] {
  return plan.pasos.filter(p => {
    if (estados[p.id] !== 'pendiente') return false;
    if (p.depende.length === 0) return false;
    return p.depende.every(d => estados[d] === 'hecho');
  });
}

export function repartirPasos(listos: Paso[], agentes: Array<{id: string; ocupado: boolean; puede?: string[]}>, tope = 8): Array<{paso: string; agente: string}> {
  const sortedListos = [...listos].sort((a, b) => a.id.localeCompare(b.id));
  const sortedAgents = [...agentes].sort((a, b) => a.id.localeCompare(b.id));
  const res: Array<{paso: string; agente: string}> = [];
  const usedAg = new Set<string>(), usedSt = new Set<string>();
  for (const p of sortedListos) {
    if (res.length >= tope) break;
    if (usedSt.has(p.id)) continue;
    for (const a of sortedAgents) {
      if (usedAg.has(a.id) || a.ocupado) continue;
      const puede = a.puede;
      if (puede && puede.length && !puede.includes(p.atomo)) continue;
      res.push({ paso: p.id, agente: a.id });
      usedAg.add(a.id);
      usedSt.add(p.id);
      break;
    }
  }
  return res;
}

export function progreso(plan: Plan, estados: Record<string, EstadoPaso>): {hechos: number; total: number; enCurso: number; bloqueados: number} {
  const { pasos } = plan;
  let h = 0, t = pasos.length, e = 0, b = 0;
  for (const p of pasos) {
    const s = estados[p.id];
    if (s === 'hecho') h++;
    else if (s === 'en-curso' || s === 'verificando') e++;
    else if (s === 'pendiente') {
      if (!p.depende.every(d => estados[d] === 'hecho')) b++;
    }
  }
  return { hechos: h, total: t, enCurso: e, bloqueados: b };
}