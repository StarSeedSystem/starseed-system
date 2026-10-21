// Malla cristalina SiO₂ amorfa: relajación local en tiempo real con histéresis según la temperatura (§1).
// Nada de recristalizar de golpe: solo se relaja el vecindario de lo cambiado. Puro: sin node:*, Supabase ni window.
import { coordinacionDe, type Cristal, type NeuronaReticula, type Puente, type Reticula, type SenalMedida } from './tipos';
import { cristalizar } from './cristalizacion';
import { costeSenal } from './coste';
import { huellaReticula, senalesDeReticula } from './teselas';
import { esTitanio, margenDePuente, temperaturaAmortiguada, MARGEN_TITANIO } from './titanio';
export interface OpcRelajar { confianza?: Record<string, number>; temperatura?: Record<string, number> }
const par = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const clave = (p: Puente): string => `${par(p.a, p.b)}|${p.medio}`;
const claveDe = (s: SenalMedida): string => `${par(s.de, s.a)}|${s.medio}`;
const porClave = <T>(k: (x: T) => string) => (x: T, y: T): number => +(k(x) > k(y)) - +(k(x) < k(y)); // orden total
const ordenar = (ps: Puente[]): Puente[] => [...ps].sort(porClave(clave));
const toca = (p: Puente, id: string): boolean => p.a === id || p.b === id;
const otroDe = (p: Puente, id: string): string => (p.a === id ? p.b : p.a);
const grado = (ps: Puente[], id: string): number => ps.filter(p => toca(p, id)).length;
const neuronas = (r: Reticula) => new Map(Object.values(r.teselas).map(t => [t.neurona.id, t.neurona] as const));
/** Margen de histéresis lineal: 30 % en zona vítrea (temperatura 0) → 5 % fundida (temperatura 1). */
export function margenHisteresis(temperatura: number): number {
  return 0.3 - 0.25 * (Number.isFinite(temperatura) ? Math.min(1, Math.max(0, temperatura)) : 0.5);
}
// Anchura desde varias neuronas a la vez con lista de adyacencia: O(puentes). A la frontera solo pasa lo que el Set añade.
function alcance(puentes: Puente[], origenes: string[], saltos: number): Set<string> {
  const ady = new Map<string, string[]>(), vistos = new Set(origenes);
  const une = (x: string, y: string): void => void (ady.get(x)?.push(y) ?? ady.set(x, [y]));
  puentes.forEach(p => { une(p.a, p.b); une(p.b, p.a); });
  for (let s = 0, f = [...vistos]; s < saltos && f.length > 0; s++)
    f = f.flatMap(n => (ady.get(n) ?? []).filter(m => vistos.size !== vistos.add(m).size));
  return vistos;
}
/** Neuronas a ≤ `saltos` saltos de `origen` por los puentes del cristal (el origen incluido). */
export const vecindario = (cristal: Cristal, origen: string, saltos = 2): Set<string> => alcance(cristal.puentes, [origen], saltos);
// ¿Siguen unidas a y b por estos puentes? Basta para saber si quitar el puente a–b desconecta la red.
const unidos = (ps: Puente[], a: string, b: string): boolean => alcance(ps, [a], Infinity).has(b);
// Coste ACTUAL con costeSenal sobre las señales de ahora; sin señal medida vale `siNoHay` (Infinity: ya no lo mide nadie).
function tasador(r: Reticula, confianza: Record<string, number> = {}): (p: Puente, siNoHay: number) => number {
  const costes = new Map<string, number>();
  for (const s of senalesDeReticula(r))
    costes.set(claveDe(s), costeSenal(s, Math.min(confianza[s.de] ?? 1, confianza[s.a] ?? 1)));
  return (p, siNoHay) => costes.get(clave(p)) ?? siNoHay;
}
// Coordinación máxima: la de su capacidad, +1 si su zona está fundida (la misma regla que cristalizar).
const limitador = (neur: Map<string, NeuronaReticula>, temp: Record<string, number>) => (id: string): number => {
  const n = neur.get(id);
  return n ? coordinacionDe(n) + ((temp[id] ?? 0.5) >= 0.6 ? 1 : 0) : 0;
};
function montar(r: Reticula, puentes: Puente[], base: Cristal, raiz = huellaReticula(r)): Cristal {
  const ps = ordenar(puentes), g = new Map<string, number>([...neuronas(r).keys()].sort().map(id => [id, 0]));
  for (const p of ps) for (const id of [p.a, p.b]) { const n = g.get(id); if (n !== undefined) g.set(id, n + 1); }
  return { ...base, puentes: ps, coordinacion: Object.fromEntries(g), huella: `${raiz}:${ps.length}` };
}
/** Relaja solo el vecindario (≤ 2 saltos) de las neuronas cambiadas; el resto del cristal no se toca. */
export function relajarLocal(previo: Cristal | null, r: Reticula, cambiadas: string[], opc: OpcRelajar = {}): Cristal {
  if (!previo) return cristalizar(r, opc);
  // La temperatura que no llega nueva se hereda del previo: el propuesto y la salida usan la misma.
  const temp = { ...previo.temperatura, ...(opc.temperatura ?? {}) }, prop = cristalizar(r, { ...opc, temperatura: temp });
  const neur = neuronas(r), coste = tasador(r, opc.confianza), limite = limitador(neur, temp);
  // Un titanio (router) lleva siempre la histéresis máxima: fija la red mientras lo demás se mueve.
  const margen = (p: Puente, e: string): number => {
    const aTi = neur.has(p.a) ? esTitanio(neur.get(p.a)!) : false;
    const bTi = neur.has(p.b) ? esTitanio(neur.get(p.b)!) : false;
    return margenDePuente(margenHisteresis(temp[e] ?? 0.5), aTi, bTi);
  };
  const mejora = (n: Puente, v: Puente, m: number): boolean => coste(n, n.coste) < coste(v, Infinity) * (1 - m);
  // Las neuronas que entran en la retícula o salen de ella también cuentan como cambiadas.
  const conocidas = new Set(Object.keys(previo.coordinacion)), todas = [...neur.keys(), ...conocidas];
  const semillas = [...cambiadas, ...todas.filter(i => !conocidas.has(i) || !neur.has(i))];
  const zona = new Set([...alcance(previo.puentes, semillas, 2), ...alcance(prop.puentes, semillas, 2)]);
  const dentro = (p: Puente): boolean => zona.has(p.a) || zona.has(p.b);
  const enProp = new Map(prop.puentes.map(p => [par(p.a, p.b), p]));
  // Dentro de la zona, un puente que sigue en el propuesto se refresca; si cambia de medio, pasa la histéresis.
  let res = previo.puentes.filter(p => neur.has(p.a) && neur.has(p.b)).map(p => {
    const q = dentro(p) ? enProp.get(par(p.a, p.b)) : undefined;
    return q && (q.medio === p.medio || mejora(q, p, Math.max(margen(p, p.a), margen(p, p.b)))) ? q : p;
  });
  const previos = new Set(res.map(p => par(p.a, p.b))), usados = new Set<Puente>();
  const nuevos = ordenar(prop.puentes.filter(p => dentro(p) && !previos.has(par(p.a, p.b))))
    .sort((x, y) => coste(x, x.coste) - coste(y, y.coste));
  for (const v of ordenar(res.filter(p => dentro(p) && !enProp.has(par(p.a, p.b))))) {
    const vivo = Number.isFinite(coste(v, Infinity));
    const sust = nuevos.find(n => !usados.has(n) && (toca(n, v.a) || toca(n, v.b)));
    let prueba = res.filter(p => p !== v);
    if (sust) {
      usados.add(sust);
      const e = toca(sust, v.a) ? v.a : v.b, g = otroDe(sust, e);
      // Si ya no lo mide nadie, se sustituye aunque el nuevo extremo quede con un defecto de coordinación (§1).
      if (!mejora(sust, v, margen(v, e)) || (vivo && grado(res, g) >= limite(g))) continue;
      prueba = [...prueba, sust];
    } else if (vivo && ![v.a, v.b].some(i => grado(res, i) > limite(i))) continue; // sin sustituto, se conserva
    if (unidos(prueba, v.a, v.b)) res = prueba; // si el cambio desconecta, se conserva el previo
  }
  // Altas puras del propuesto: si unen dos trozos, siempre; si no, solo con coordinación libre.
  for (const n of nuevos.filter(x => !usados.has(x)))
    if ([n.a, n.b].every(i => grado(res, i) < limite(i)) || !unidos(res, n.a, n.b)) res = [...res, n];
  return montar(r, res, prop, prop.huella.slice(0, prop.huella.lastIndexOf(':'))); // huella ya calculada: no repetirla
}
// PRNG mulberry32 sembrado con FNV-1a de la huella: misma retícula, mismo recocido en cualquier neurona.
const fnv1a = (txt: string): number => [...txt].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5) >>> 0;
const mulberry32 = (a: number) => (): number => {
  a = (a + 0x6d2b79f5) | 0;
  const t = Math.imul(a ^ (a >>> 15), 1 | a), u = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
};
/** Búsqueda local: cambia un puente por una señal medida del MISMO extremo si baja el coste total,
 *  sin pasar la coordinación del nuevo extremo y sin desconectar la red. */
export function recocer(cristal: Cristal, r: Reticula, pasos = 30): Cristal {
  // Señales en orden total: con el de llegada de las teselas, dos neuronas con la misma huella sortearían distinto.
  const azar = mulberry32(fnv1a(cristal.huella)), neur = neuronas(r), senales = senalesDeReticula(r).sort(porClave(claveDe));
  const coste = tasador(r), limite = limitador(neur, cristal.temperatura);
  let res = ordenar(cristal.puentes);
  for (let i = 0; i < pasos && res.length > 0; i++) {
    const viejo = res[Math.floor(azar() * res.length)], e = azar() < 0.5 ? viejo.a : viejo.b;
    const vecinos = new Set(res.filter(p => toca(p, e)).map(p => otroDe(p, e)));
    const cands = senales.filter(s => (s.de === e || s.a === e) && s.de !== s.a)
      .map(s => ({ s, x: s.de === e ? s.a : s.de })).filter(c => !vecinos.has(c.x) && neur.has(c.x));
    if (cands.length === 0) continue;
    const { s, x } = cands[Math.floor(azar() * cands.length)];
    const nuevo: Puente = { a: e, b: x, medio: s.medio, coste: costeSenal(s) };
    if (!(nuevo.coste < coste(viejo, viejo.coste)) || grado(res, x) >= limite(x)) continue;
    const prueba = [...res.filter(p => p !== viejo), nuevo];
    if (unidos(prueba, e, otroDe(viejo, e))) res = ordenar(prueba);
  }
  return montar(r, res, cristal);
}
