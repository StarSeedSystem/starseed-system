/** Protomolécula · convergencia del grafo de átomos. Puro, sin React ni node:*. */
import type { DefinicionAtomo } from "./registro-atomos";

export interface Arista { de: string; a: string; }
export interface Diagnostico {
  ok: boolean; orden: string[]; ciclos: string[][];
  incompatibles: { arista: Arista; salidas: string[]; entradas: string[] }[];
  conversiones: { arista: Arista; ruta: string[] }[]; avisos: string[];
}

function nf(x: string): string { return x.trim().toLowerCase().replace(/\./g, ""); }

export function analizarConvergencia(
  atomos: { id: string; herramientaId: string }[],
  aristas: Arista[],
  definicion: (herramientaId: string) => DefinicionAtomo | undefined,
  rutaDe: (de: string, a: string) => string[] | null,
): Diagnostico {
  const out: Diagnostico = { ok: true, orden: [], ciclos: [], incompatibles: [], conversiones: [], avisos: [] };
  const ids = new Set(atomos.map((a) => a.id));
  const ordenEntrada = new Map(atomos.map((a, i) => [a.id, i]));
  const avisos: string[] = [];
  for (const at of atomos) {
    const d = definicion(at.herramientaId);
    if (!d) avisos.push(`La herramienta ${at.herramientaId} no tiene definición.`);
    else if (!d.entradas || d.entradas.length === 0) avisos.push(`La herramienta ${at.herramientaId} no recibe archivos.`);
  }
  const defs = new Map(atomos.map((a) => [a.id, definicion(a.herramientaId)]));

  const ciclos: string[][] = [];
  function dfs(n: string, camino: string[], enCamino: Set<string>) {
    enCamino.add(n); camino.push(n);
    for (const ar of aristas) { if (ar.de !== n || !ids.has(ar.a)) continue;
      if (enCamino.has(ar.a)) { const ini = camino.indexOf(ar.a); ciclos.push(camino.slice(ini).map((v) => v)); }
      else dfs(ar.a, camino, enCamino);
    }
    camino.pop(); enCamino.delete(n);
  }
  for (const at of atomos) dfs(at.id, [], new Set());
  const visto = new Set<string>();
  const ciclosFiltrados: string[][] = [];
  for (const c of ciclos) {
    const rot = c.map((_, i) => [...c.slice(i), ...c.slice(0, i)].join(",")).sort()[0];
    if (!visto.has(rot)) { visto.add(rot); ciclosFiltrados.push([...c]); }
  }
  out.ciclos = ciclosFiltrados;

  const incomp: typeof out.incompatibles = [];
  const conv: typeof out.conversiones = [];
  for (const ar of aristas) {
    if (!ids.has(ar.de) || !ids.has(ar.a)) {
      avisos.push(`Arista de ${ar.de} a ${ar.a} referencia un átomo que no existe.`);
      const e = (defs.get(ar.a)?.entradas ?? []).map(nf);
      incomp.push({ arista: ar, salidas: [], entradas: e }); continue;
    }
    const dDe = defs.get(ar.de), dA = defs.get(ar.a);
    if (!dDe) { const e = dA ? dA.entradas.map(nf) : []; avisos.push(`Arista ${ar.de} → ${ar.a}: el origen no tiene definición.`); incomp.push({ arista: ar, salidas: [], entradas: e }); continue; }
    if (!dA) { const s = dDe.salidas.map(nf); avisos.push(`Arista ${ar.de} → ${ar.a}: el destino no tiene definición.`); incomp.push({ arista: ar, salidas: s, entradas: [] }); continue; }
    const sal = (dDe.salidas ?? []).map(nf).filter((f) => f.length > 0);
    const ent = (dA.entradas ?? []).map(nf).filter((f) => f.length > 0);
    const dir = sal.some((s) => ent.includes(s));
    let mejor: string[] | null = null;
    if (!dir) for (const s of sal) for (const e of ent) { const r = rutaDe(s, e); if (r && r.length > 0 && (!mejor || r.length < mejor.length)) mejor = r; }
    if (dir) { /* nada */ } else if (mejor) conv.push({ arista: ar, ruta: mejor }); else { if (ent.length === 0) avisos.push(`La herramienta ${ar.a} no recibe archivos.`); incomp.push({ arista: ar, salidas: sal, entradas: ent }); }
  }
  out.incompatibles = incomp; out.conversiones = conv; out.avisos = avisos;

  const adj = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const at of atomos) { adj.set(at.id, new Set()); indeg.set(at.id, 0); }
  for (const ar of aristas) { if (!ids.has(ar.de) || !ids.has(ar.a)) continue; if (!adj.get(ar.de)!.has(ar.a)) { adj.get(ar.de)!.add(ar.a); indeg.set(ar.a, (indeg.get(ar.a) ?? 0) + 1); } }
  const disp: string[] = [];
  Array.from(indeg.keys()).forEach((k: string) => { if (indeg.get(k) === 0) disp.push(k); });
  disp.sort((a, b) => { const ia = ordenEntrada.get(a) ?? 0, ib = ordenEntrada.get(b) ?? 0; return ia - ib || a.localeCompare(b); });
  const orden: string[] = [];
  while (disp.length) {
    const id = disp.shift()!; orden.push(id);
    for (const d of Array.from(adj.get(id) ?? new Set<string>()) as string[]) {
      const n = (indeg.get(d) ?? 1) - 1; indeg.set(d, n); if (n === 0) disp.push(d);
    }
    disp.sort((a, b) => { const ia = ordenEntrada.get(a) ?? 0, ib = ordenEntrada.get(b) ?? 0; return ia - ib || a.localeCompare(b); });
  }
  out.orden = orden;
  out.ok = out.ciclos.length === 0 && out.incompatibles.length === 0 && out.avisos.length === 0;
  return out;
}
