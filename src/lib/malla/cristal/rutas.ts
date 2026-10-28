// Malla cristalina SiO₂ amorfa: las k mejores rutas sobre los puentes del cristal.
// Función pura: sin node:* ni Supabase ni window (se importa desde el navegador).
import { viabilidad } from './viabilidad'
import { senalesDeReticula } from './teselas'
import type { Cristal, Dato, Medio, Puente, Reticula, SenalMedida } from './tipos'

export interface Ruta { saltos: string[]; medios: Medio[]; coste: number; motivo: string }
type Ctx = { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }
interface Arista { a: string; b: string; medio: Medio; coste: number }

function claveArista(e: Pick<Arista, 'a' | 'b' | 'medio'>): string {
  const [x, y] = e.a < e.b ? [e.a, e.b] : [e.b, e.a]
  return `${x}|${y}|${e.medio}`
}
function claveRuta(r: Ruta): string { return r.saltos.join('>') }
// Orden por coste y, a igual coste, por la secuencia de saltos.
function comparar(a: Ruta, b: Ruta): number {
  if (Math.abs(a.coste - b.coste) > 1e-9) return a.coste - b.coste
  for (let i = 0; i < Math.min(a.saltos.length, b.saltos.length); i++) {
    const c = a.saltos[i].localeCompare(b.saltos[i])
    if (c !== 0) return c
  }
  return a.saltos.length - b.saltos.length
}
// Señal medida del puente; si no se midió, se sintetiza sin métricas.
function senalDe(p: Puente, senales: SenalMedida[]): SenalMedida {
  const s = senales.find((m) => m.medio === p.medio &&
    ((m.de === p.a && m.a === p.b) || (m.de === p.b && m.a === p.a)))
  return s ?? { de: p.a, a: p.b, medio: p.medio, vistaEn: 0 }
}
// Aristas aptas: coste de un salto = 1 − viabilidad(dato, señal del puente).
function aristasAptas(cristal: Cristal, r: Reticula, dato: Dato, ctx: Ctx): Arista[] {
  const senales = senalesDeReticula(r)
  const aristas: Arista[] = []
  for (const p of cristal.puentes) {
    const v = viabilidad(dato, senalDe(p, senales), ctx)
    if (v.apto) aristas.push({ a: p.a, b: p.b, medio: p.medio, coste: 1 - v.valor })
  }
  return aristas
}

function costesDe(aristas: Arista[]): Map<string, number> {
  return aristas.reduce((m, e) => m.set(claveArista(e), Math.min(e.coste, m.get(claveArista(e)) ?? Infinity)), new Map<string, number>())
}
function costeDe(r: Ruta, costes: Map<string, number>): number {
  return r.medios.reduce((t, m, i) =>
    t + (costes.get(claveArista({ a: r.saltos[i], b: r.saltos[i + 1], medio: m })) ?? 0), 0)
}
// Dijkstra determinista sobre caminos completos, sin bucles y con vetos.
function caminoMinimo(aristas: Arista[], origen: string, destino: string,
  vetadas: Set<string>, vetados: Set<string>): Ruta | null {
  const cola: Ruta[] = [{ saltos: [origen], medios: [], coste: 0, motivo: '' }]
  const vistos = new Set<string>()
  while (cola.length > 0) {
    cola.sort(comparar)
    const actual = cola.shift() as Ruta
    const fin = actual.saltos[actual.saltos.length - 1]
    if (vistos.has(fin)) continue
    vistos.add(fin)
    if (fin === destino) return actual
    for (const e of aristas) {
      if (vetadas.has(claveArista(e)) || vetados.has(e.a) || vetados.has(e.b)) continue
      const vecino = e.a === fin ? e.b : e.b === fin ? e.a : null
      if (vecino === null || actual.saltos.includes(vecino)) continue
      cola.push({ saltos: [...actual.saltos, vecino], medios: [...actual.medios, e.medio], coste: actual.coste + e.coste, motivo: '' })
    }
  }
  return null
}

// Yen: k rutas sin bucles; cada vuelta desvía la última aceptada por cada salto.
function yen(aristas: Arista[], origen: string, destino: string, k: number): Ruta[] {
  if (k <= 0) return []
  const costes = costesDe(aristas)
  const aceptadas: Ruta[] = []
  const candidatas: Ruta[] = []
  const vistas = new Set<string>()
  let previa = caminoMinimo(aristas, origen, destino, new Set(), new Set())
  while (previa && aceptadas.length < k) {
    aceptadas.push(previa)
    vistas.add(claveRuta(previa))
    for (let i = 0; i < previa.saltos.length - 1; i++) {
      const raiz = previa.saltos.slice(0, i + 1)
      const vetadas = new Set(aceptadas
        .filter((r) => raiz.every((n, j) => r.saltos[j] === n))
        .map((r) => claveArista({ a: r.saltos[i], b: r.saltos[i + 1], medio: r.medios[i] })))
      const cola = caminoMinimo(aristas, raiz[i], destino, vetadas, new Set(raiz.slice(0, -1)))
      if (!cola) continue
      const saltos = [...raiz.slice(0, -1), ...cola.saltos]
      const ruta: Ruta = { saltos, medios: [...previa.medios.slice(0, i), ...cola.medios], coste: 0, motivo: '' }
      const clave = claveRuta(ruta)
      if (vistas.has(clave)) continue
      ruta.coste = costeDe(ruta, costes)
      ruta.motivo = saltos.length === 2 ? 'ruta directa' : `ruta de ${saltos.length - 1} saltos`
      vistas.add(clave)
      candidatas.push(ruta)
    }
    candidatas.sort(comparar)
    previa = candidatas.shift() ?? null
  }
  return aceptadas.sort(comparar)
}

// Difusión: un salto desde el origen a cada vecino directo apto.
function difusion(aristas: Arista[], origen: string): Ruta[] {
  const mejores = new Map<string, Arista>()
  for (const e of aristas) {
    const vecino = e.a === origen ? e.b : e.b === origen ? e.a : null
    if (vecino === null) continue
    const anterior = mejores.get(vecino)
    if (!anterior || e.coste < anterior.coste) mejores.set(vecino, e)
  }
  return [...mejores].map(([vecino, e]) => ({ saltos: [origen, vecino], medios: [e.medio], coste: e.coste, motivo: 'vecino directo' })).sort(comparar)
}
export function mejoresRutas(cristal: Cristal, r: Reticula, dato: Dato, ctx: Ctx, k = 3): Ruta[] {
  const aristas = aristasAptas(cristal, r, dato, ctx)
  if (dato.destino === null) return difusion(aristas, dato.origen)
  return yen(aristas, dato.origen, dato.destino, k)
}
