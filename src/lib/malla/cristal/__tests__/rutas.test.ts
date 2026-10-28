// Malla cristalina SiO₂ amorfa: pruebas de las k mejores rutas.
import { describe, it, expect } from 'vitest'
import { mejoresRutas } from '../rutas'
import type { Cristal, Dato, Medio, NeuronaReticula, Reticula, SenalMedida, Tesela } from '../tipos'

const señal = (de: string, a: string, medio: Medio = 'wifi-lan'): SenalMedida => ({
  de, a, medio, rssiDbm: -50, snrDb: 20, rttMs: 50, anchoBandaKbps: 100000, perdidaPct: 0, vistaEn: 1,
})

function neurona(id: string): NeuronaReticula {
  return { id, cuenta: 'cuentaA', capacidad: { ramGb: 4, bateriaPct: 80, cargando: false }, medios: ['wifi-lan'] }
}

function reticula(...senales: SenalMedida[]): Reticula {
  const teselas: Record<string, Tesela> = {}
  for (const s of senales) {
    const previa = teselas[s.de]
    teselas[s.de] = { origen: s.de, reloj: 1, neurona: neurona(s.de), senales: [...(previa?.senales ?? []), s] }
  }
  return { teselas }
}

function cristal(...puentes: Array<[string, string]>): Cristal {
  return {
    puentes: puentes.map(([a, b]) => ({ a, b, medio: 'wifi-lan', coste: 0.5 })),
    estado: 'vitreo', temperatura: {}, huella: 'prueba', coordinacion: {},
  }
}

function dato(over: Partial<Dato> = {}): Dato {
  return { id: 'd1', clase: 'publico', tipo: 'mensaje', bytes: 100, prioridad: 1, origen: 'a', destino: 'b', ...over }
}

function contexto(cuentas: Record<string, string>): { cuentaDe: (id: string) => string | null; bateriaPct: number; cifradoE2E: boolean } {
  return { cuentaDe: (id) => cuentas[id] ?? null, bateriaPct: 80, cifradoE2E: true }
}

describe('mejoresRutas', () => {
  it('devuelve la ruta directa si existe', () => {
    const rutas = mejoresRutas(cristal(['a', 'b']), reticula(señal('a', 'b')), dato(), contexto({ a: 'A', b: 'A' }))
    expect(rutas).toHaveLength(1)
    expect(rutas[0].saltos).toEqual(['a', 'b'])
    expect(rutas[0].medios).toEqual(['wifi-lan'])
    expect(rutas[0].coste).toBeGreaterThan(0)
    expect(rutas[0].coste).toBeLessThan(1)
  })

  it('rodea el enlace vetado por privacidad', () => {
    const r = reticula(señal('a', 'b'), señal('b', 'c'), señal('a', 'd'), señal('d', 'c'))
    const c = cristal(['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'c'])
    const rutas = mejoresRutas(c, r, dato({ clase: 'interno', destino: 'c' }), contexto({ a: 'A', b: 'B', c: 'A', d: 'A' }))
    expect(rutas[0].saltos).toEqual(['a', 'd', 'c'])
    expect(rutas.some((ruta) => ruta.saltos.includes('b'))).toBe(false)
  })

  it('devuelve k rutas distintas sin bucles', () => {
    const r = reticula(señal('a', 'b'), señal('b', 'd'), señal('a', 'c'), señal('c', 'd'), señal('a', 'e'), señal('e', 'd'))
    const c = cristal(['a', 'b'], ['b', 'd'], ['a', 'c'], ['c', 'd'], ['a', 'e'], ['e', 'd'])
    const rutas = mejoresRutas(c, r, dato({ destino: 'd' }), contexto({ a: 'A', b: 'A', c: 'A', d: 'A', e: 'A' }), 3)
    expect(rutas).toHaveLength(3)
    expect(new Set(rutas.map((ruta) => ruta.saltos.join('>'))).size).toBe(3)
    expect(rutas.every((ruta) => ruta.saltos[0] === 'a' && ruta.saltos[ruta.saltos.length - 1] === 'd')).toBe(true)
    expect(rutas.every((ruta) => new Set(ruta.saltos).size === ruta.saltos.length)).toBe(true)
  })

  it('devuelve [] si no hay ninguna ruta', () => {
    const rutas = mejoresRutas(cristal(['a', 'b']), reticula(señal('a', 'b')), dato({ origen: 'x', destino: 'y' }), contexto({ a: 'A', b: 'A' }))
    expect(rutas).toEqual([])
  })

  it('en difusión devuelve un salto desde el origen a cada vecino directo', () => {
    const r = reticula(señal('a', 'b'), señal('a', 'c'), señal('b', 'c'))
    const c = cristal(['a', 'b'], ['a', 'c'], ['b', 'c'])
    const rutas = mejoresRutas(c, r, dato({ destino: null }), contexto({ a: 'A', b: 'A', c: 'A' }))
    expect(rutas.map((ruta) => ruta.saltos)).toEqual([['a', 'b'], ['a', 'c']])
  })
})
