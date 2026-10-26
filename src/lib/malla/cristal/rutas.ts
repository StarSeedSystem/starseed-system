// Malla cristalina SiO₂ amorfa: mejores rutas sobre los puentes (Dijkstra + Yen)
// Función pura: sin node:* ni Supabase ni window
import type { Cristal, Reticula, Dato, Medio, SenalMedida } from './tipos'
import { viabilidad } from './viabilidad'
import { senalesDeReticula } from './teselas'
export interface Ruta { saltos: string[]; medios: Medio[]; coste: number; motivo: string }
export interface ContextoRutas { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }
interface Arista { nodo: string; medio: Medio; coste: number; clave: string }
type Grafo = Map<string, Arista[]>
const claveDe = (a: string, b: string, m: Medio) => (a < b ? `${a}|${b}|${m}` : `${b}|${a}|${m}`)
const mismoCamino = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i])
const tieneBucle = (s: string[]) => new Set(s).size !== s.length
function comparar(a: Ruta, b: Ruta): number { return a.coste - b.coste || a.saltos.length - b.saltos.length || a.saltos.join('>').localeCompare(b.saltos.join('>')) || a.medios.join(',').localeCompare(b.medios.join(',')) }
function construirGrafo(cristal: Cristal, r: Reticula, dato: Dato, ctx: ContextoRutas): Grafo {
  const medidas = new Map<string, SenalMedida>()
  for (const s of senalesDeReticula(r)) medidas.set(claveDe(s.de, s.a, s.medio), s)
  const aristas = new Map<string, { a: string; b: string; medio: Medio; coste: number }>()
  for (const p of cristal.puentes) {
    const clave = claveDe(p.a, p.b, p.medio)
    const s = medidas.get(clave) ?? { de: p.a, a: p.b, medio: p.medio, vistaEn: 0 }
    const v = viabilidad(dato, s, ctx)
    if (!v.apto) continue
    const coste = Math.max(0, Math.min(1, 1 - v.valor))
    const previa = aristas.get(clave)
    if (!previa || coste < previa.coste) aristas.set(clave, { a: p.a, b: p.b, medio: p.medio, coste })
  }
  const grafo: Grafo = new Map()
  for (const [clave, e] of aristas) for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
    const lista = grafo.get(x) ?? []
    lista.push({ nodo: y, medio: e.medio, coste: e.coste, clave })
    grafo.set(x, lista)
  }
  for (const lista of grafo.values())
    lista.sort((x, y) => x.coste - y.coste || x.nodo.localeCompare(y.nodo) || x.medio.localeCompare(y.medio))
  return grafo
}
function dijkstra(desde: string, hasta: string, grafo: Grafo, bloqueadas: Set<string>, vetados: Set<string>): Ruta | null {
  if (vetados.has(desde) || vetados.has(hasta)) return null
  const dist = new Map([[desde, 0]]), brincos = new Map([[desde, 0]])
  const previo = new Map<string, { nodo: string; medio: Medio }>()
  const abiertos = new Set([desde])
  while (abiertos.size > 0) {
    let actual: string | null = null
    for (const n of abiertos) {
      if (actual === null) { actual = n; continue }
      const d = dist.get(n)! - dist.get(actual)!, b = brincos.get(n)! - brincos.get(actual)!
      if (d < 0 || (d === 0 && (b < 0 || (b === 0 && n < actual)))) actual = n
    }
    if (actual === null) break
    abiertos.delete(actual)
    if (actual === hasta) break
    for (const e of grafo.get(actual) ?? []) {
      if (bloqueadas.has(e.clave) || vetados.has(e.nodo)) continue
      const nd = dist.get(actual)! + e.coste, nb = brincos.get(actual)! + 1
      const d = dist.get(e.nodo)
      if (d !== undefined && (nd > d + 1e-12 || (Math.abs(nd - d) <= 1e-12 && nb >= brincos.get(e.nodo)!))) continue
      dist.set(e.nodo, nd); brincos.set(e.nodo, nb)
      previo.set(e.nodo, { nodo: actual, medio: e.medio }); abiertos.add(e.nodo)
    }
  }
  if (!dist.has(hasta)) return null
  const saltos = [hasta], medios: Medio[] = []
  for (let actual = hasta; actual !== desde;) {
    const p = previo.get(actual)
    if (!p) return null
    medios.unshift(p.medio); saltos.unshift(p.nodo); actual = p.nodo
  }
  return { saltos, medios, coste: dist.get(hasta)!, motivo: '' }
}
function costeDe(saltos: string[], medios: Medio[], grafo: Grafo): number {
  let total = 0
  for (let i = 0; i < saltos.length - 1; i++) {
    const e = (grafo.get(saltos[i]) ?? []).find(x => x.nodo === saltos[i + 1] && x.medio === medios[i])
    if (!e) return Infinity
    total += e.coste
  }
  return total
}
function rutasYen(origen: string, destino: string, grafo: Grafo, k: number): Ruta[] {
  const primera = dijkstra(origen, destino, grafo, new Set(), new Set())
  if (!primera) return []
  const rutas = [primera], candidatas: Ruta[] = []
  while (rutas.length < k) {
    const previa = rutas[rutas.length - 1]
    for (let i = 0; i < previa.saltos.length - 1; i++) {
      const raiz = previa.saltos.slice(0, i + 1), bloqueadas = new Set<string>()
      for (const p of rutas) {
        if (p.saltos.length > i + 1 && raiz.every((s, j) => s === p.saltos[j]))
          bloqueadas.add(claveDe(p.saltos[i], p.saltos[i + 1], p.medios[i]))
      }
      const cola = dijkstra(raiz[i], destino, grafo, bloqueadas, new Set(raiz.slice(0, -1)))
      if (!cola) continue
      const saltos = [...raiz.slice(0, -1), ...cola.saltos], medios = [...previa.medios.slice(0, i), ...cola.medios]
      if (tieneBucle(saltos) || rutas.some(p => mismoCamino(p.saltos, saltos)) || candidatas.some(p => mismoCamino(p.saltos, saltos))) continue
      const coste = costeDe(saltos, medios, grafo)
      if (Number.isFinite(coste)) candidatas.push({ saltos, medios, coste, motivo: '' })
    }
    if (candidatas.length === 0) break
    candidatas.sort(comparar)
    rutas.push(candidatas.shift()!)
  }
  return rutas.sort(comparar)
}
function difusion(grafo: Grafo, origen: string): Ruta[] {
  const vistos = new Set<string>(), rutas: Ruta[] = []
  for (const e of grafo.get(origen) ?? []) {
    if (vistos.has(e.nodo)) continue
    vistos.add(e.nodo)
    rutas.push({ saltos: [origen, e.nodo], medios: [e.medio], coste: e.coste, motivo: '' })
  }
  return rutas.sort(comparar)
}
export function mejoresRutas(cristal: Cristal, r: Reticula, dato: Dato, ctx: ContextoRutas, k = 3): Ruta[] {
  if (k <= 0) return []
  const grafo = construirGrafo(cristal, r, dato, ctx)
  if (dato.destino === null) return difusion(grafo, dato.origen)
  return rutasYen(dato.origen, dato.destino, grafo, k)
}
