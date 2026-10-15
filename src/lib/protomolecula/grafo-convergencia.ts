import type { DefinicionAtomo } from "./registro-atomos";
import type { Parametro } from "./tipos";

export interface Arista { de: string; a: string; }
export interface Diagnostico {
  ok: boolean;
  orden: string[];
  ciclos: string[][];
  incompatibles: { arista: Arista; salidas: string[]; entradas: string[] }[];
  conversiones: { arista: Arista; ruta: string[] }[];
  avisos: string[];
}

export function analizarConvergencia(
  a: { id: string; herramientaId: string }[],
  e: Arista[],
  d: (h: string) => DefinicionAtomo | undefined,
  r: (de: string, a: string) => string[] | null
): Diagnostico {
  const m = new Map<string, { i: number; d: DefinicionAtomo | undefined }>();
  const g = new Map<string, string[]>();
  const deg = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    const { id, herramientaId } = a[i];
    m.set(id, { i, d: d(herramientaId) });
    g.set(id, []);
    deg.set(id, 0);
  }

  const inc: Diagnostico['incompatibles'] = [];
  const conv: Diagnostico['conversiones'] = [];
  const av: Set<string> = new Set();

  for (const ar of e) {
    const { de, a: ad } = ar;
    const o = m.get(de);
    const t = m.get(ad);
    if (!o || !t) continue;

    const { d: dO } = o;
    const { d: dT } = t;
    const s = dO ? new Set(dO.salidas.map(f => f.toLowerCase().replace(/\./g, ''))) : new Set();
    const en = dT ? new Set(dT.entradas.map(f => f.toLowerCase().replace(/\./g, ''))) : new Set();

    let match = false;
    for (const salt of s) {
      if (en.has(salt)) {
        match = true;
        break;
      }
    }
    if (match) continue;

    let ruta = null;
    for (const salt of s) {
      for (const ent of en) {
        const rt = r(salt, ent);
        if (rt !== null) {
          ruta = rt;
          break;
        }
      }
      if (ruta !== null) break;
    }

    if (ruta !== null) {
      conv.push({ arista: { de, a: ad }, ruta });
    } else {
      inc.push({ arista: { de, a: ad }, salidas: Array.from(s), entradas: Array.from(en) });
    }

    if (!dT || dT.entradas.length === 0) {
      const { herramientaId } = a.find(at => at.id === ad)!;
      av.add(`La herramienta ${herramientaId} no recibe archivos`);
    }

    if (m.has(de) && m.has(ad)) {
      const deps = g.get(de)!;
      deps.push(ad);
      g.set(de, deps);
      deg.set(ad, deg.get(ad)! + 1);
    }
  }

  const ord: string[] = [];
  const degCp = new Map(deg);
  const q: string[] = [];
  for (const [id, gr] of degCp) {
    if (gr === 0) q.push(id);
  }
  q.sort((a, b) => m.get(a)!.i - m.get(b)!.i);

  while (q.length > 0) {
    const u = q.shift()!;
    ord.push(u);
    for (const v of g.get(u)!) {
      degCp.set(v, degCp.get(v)! - 1);
      if (degCp.get(v) === 0) {
        q.push(v);
        q.sort((a, b) => m.get(a)!.i - m.get(b)!.i);
      }
    }
  }

  const cycSet = new Set<string>();
  for (const [id] of m) {
    if (degCp.get(id)! > 0) cycSet.add(id);
  }

  const cycs: string[][] = cycSet.size > 0 ? [Array.from(cycSet)] : [];

  return {
    ok: cycs.length === 0,
    orden: ord,
    ciclos: cycs,
    incompatibles: inc,
    conversiones: conv,
    avisos: Array.from(av)
  };
}