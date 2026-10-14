/** Protomolécula · GRAFO DE CONVERGENCIA. Puro: sin React, sin `node:*`. */
import type { DefinicionAtomo } from "./registro-atomos";
export interface Arista { de: string; a: string; }
export interface Diagnostico {
  ok: boolean; orden: string[]; ciclos: string[][];
  incompatibles: { arista: Arista; salidas: string[]; entradas: string[] }[];
  conversiones: { arista: Arista; ruta: string[] }[]; avisos: string[];
}
function nf(x: string): string {
  let s = x.trim().toLowerCase(); s = s.replace(/^\.+/, "");
  const i = s.indexOf("/"); if (i !== -1) s = s.slice(i + 1);
  return s.replace(/^x-/, "");
}
export function analizarConvergencia(
  atomos: { id: string; herramientaId: string }[],
  aristas: Arista[],
  definicion: (h: string) => DefinicionAtomo | undefined,
  rutaDe: (de: string, a: string) => string[] | null,
): Diagnostico {
  const ids = new Set(atomos.map((a) => a.id));
  const mapa = new Map<string, DefinicionAtomo>();
  const avisos: string[] = [];
  const dest = new Set(aristas.map((a) => a.a));
  for (const at of atomos) {
    const d = definicion(at.herramientaId);
    if (!d) avisos.push(`La herramienta ${at.herramientaId} no tiene definición.`);
    else {
      mapa.set(at.id, d);
      const ent = (d.entradas ?? []).map(nf);
      if (ent.length === 0 && dest.has(at.id)) avisos.push(`La herramienta ${at.id} no recibe archivos.`);
    }
  }
  const adj = new Map<string, string[]>();
  for (const id of atomos.map((a) => a.id)) adj.set(id, []);
  for (const ar of aristas) { if (ids.has(ar.de) && ids.has(ar.a)) adj.get(ar.de)!.push(ar.a); }
  const ciclos: string[][] = [];
  const v = new Set<string>(), r = new Set<string>(), cam: string[] = [];
  function dfs(n: string) {
    v.add(n); r.add(n); cam.push(n);
    for (const w of adj.get(n) ?? []) {
      if (!v.has(w)) dfs(w); else if (r.has(w)) { const i = cam.indexOf(w); ciclos.push(cam.slice(i)); }
    }
    cam.pop(); r.delete(n);
  }
  for (const id of atomos.map((a) => a.id)) if (!v.has(id)) dfs(id);
  const grados = new Map<string, number>();
  for (const id of atomos.map((a) => a.id)) grados.set(id, 0);
  for (const ar of aristas) if (ids.has(ar.de) && ids.has(ar.a)) grados.set(ar.a, (grados.get(ar.a) ?? 0) + 1);
  const orden: string[] = [];
  const disponibles = new Set(atomos.map((a) => a.id).filter((id) => (grados.get(id) ?? 0) === 0));
  const ordenAtomos = atomos.map((a) => a.id);
  while (disponibles.size > 0) {
    let e = ordenAtomos.find((id) => disponibles.has(id))!;
    disponibles.delete(e);
    orden.push(e);
    for (const w of adj.get(e) ?? []) {
      const nv = (grados.get(w) ?? 1) - 1; grados.set(w, nv);
      if (nv === 0) disponibles.add(w);
    }
  }
  const hayCiclos = ciclos.length > 0;
  const ordenFinal = hayCiclos ? orden : atomos.map((a) => a.id);
  const inc: Diagnostico["incompatibles"] = [];
  const conv: Diagnostico["conversiones"] = [];
  for (const ar of aristas) {
    if (!ids.has(ar.de) || !ids.has(ar.a)) { avisos.push(`Arista desde ${ar.de} hacia ${ar.a} apunta a un átomo que no existe.`); continue; }
    const dd = mapa.get(ar.de), da = mapa.get(ar.a);
    const sal = dd ? dd.salidas.map(nf) : [];
    const ent = da ? da.entradas.map(nf) : [];
    if (!dd || sal.length === 0) { inc.push({ arista: ar, salidas: sal, entradas: ent }); continue; }
    if (!da || ent.length === 0) { inc.push({ arista: ar, salidas: sal, entradas: ent }); continue; }
    if (sal.some((s) => ent.includes(s))) continue;
    let ruta: string[] | null = null;
    for (const s of sal) for (const eF of ent) { const r = rutaDe(s, eF); if (r && r.length > 0) { ruta = r; break; } if (ruta) break; }
    if (ruta) conv.push({ arista: ar, ruta: ruta! }); else inc.push({ arista: ar, salidas: sal, entradas: ent });
  }
  return {
    ok: !hayCiclos && inc.length === 0 && avisos.length === 0,
    orden: ordenFinal, ciclos, incompatibles: inc, conversiones: conv, avisos,
  };
}
