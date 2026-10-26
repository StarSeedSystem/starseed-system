// Malla cristalina SiO₂ amorfa: pruebas de las mejores rutas sobre los puentes
import { describe, it, expect } from 'vitest'
import { mejoresRutas, type ContextoRutas } from '../rutas'
import type { Cristal, Dato, Medio, Reticula, SenalMedida, Tesela } from '../tipos'

function senal(de: string, a: string, medio: Medio = 'wifi-lan', rssiDbm = -50): SenalMedida {
  return { de, a, medio, rssiDbm, snrDb: 30, rttMs: 20, anchoBandaKbps: 100000, perdidaPct: 0, vistaEn: 1 }
}

function reticula(senales: SenalMedida[]): Reticula {
  const teselas: Record<string, Tesela> = {}
  for (const s of senales) {
    teselas[s.de] = {
      origen: s.de,
      reloj: 1,
      neurona: { id: s.de, cuenta: 'A', capacidad: { ramGb: 4, bateriaPct: 80, cargando: false }, medios: [s.medio] },
      senales: senales.filter(x => x.de === s.de),
    }
  }
  return { teselas }
}

function cristal(pares: Array<[string, string, Medio?]>): Cristal {
  return {
    puentes: pares.map(([a, b, medio = 'wifi-lan']) => ({ a, b, medio, coste: 0.5 })),
    estado: 'vitreo', temperatura: {}, huella: 'h', coordinacion: {},
  }
}

function dato(overrides: Partial<Dato> = {}): Dato {
  return { id: 'dato', clase: 'publico', tipo: 'mensaje', bytes: 100, prioridad: 0, origen: 'a', destino: 'd', ...overrides }
}

function ctx(ajenas: string[] = [], cifradoE2E = true): ContextoRutas {
  return { cuentaDe: (id) => (ajenas.includes(id) ? 'B' : 'A'), cifradoE2E }
}

describe('mejoresRutas', () => {
  it('elige la ruta directa cuando existe y es la mejor', () => {
    const senales = [senal('a', 'c'), senal('a', 'b', 'wifi-lan', -60), senal('b', 'c', 'wifi-lan', -60)]
    const rutas = mejoresRutas(cristal([['a', 'c'], ['a', 'b'], ['b', 'c']]), reticula(senales), dato({ destino: 'c' }), ctx(), 2)
    expect(rutas).toHaveLength(2)
    expect(rutas[0].saltos).toEqual(['a', 'c'])
    expect(rutas[0].medios).toEqual(['wifi-lan'])
    expect(rutas[1].saltos).toEqual(['a', 'b', 'c'])
    expect(rutas[0].coste).toBeLessThan(rutas[1].coste)
  })

  it('toma el rodeo cuando el atajo directo cruza una cuenta ajena (privacidad)', () => {
    const senales = [senal('a', 'x'), senal('x', 'd'), senal('a', 'b', 'wifi-lan', -70), senal('b', 'd', 'wifi-lan', -70)]
    const rutas = mejoresRutas(
      cristal([['a', 'x'], ['x', 'd'], ['a', 'b'], ['b', 'd']]),
      reticula(senales),
      dato({ clase: 'interno', destino: 'd' }),
      ctx(['x']),
      3,
    )
    expect(rutas).toHaveLength(1)
    expect(rutas[0].saltos).toEqual(['a', 'b', 'd'])
    expect(rutas[0].saltos).not.toContain('x')
  })

  it('devuelve k rutas distintas sin bucles, ordenadas por coste', () => {
    const senales = [
      senal('a', 'b', 'wifi-lan', -60), senal('b', 'd', 'wifi-lan', -60),
      senal('a', 'c', 'wifi-lan', -70), senal('c', 'd', 'wifi-lan', -70),
      senal('b', 'c', 'wifi-lan', -80),
    ]
    const rutas = mejoresRutas(
      cristal([['a', 'b'], ['b', 'd'], ['a', 'c'], ['c', 'd'], ['b', 'c']]),
      reticula(senales),
      dato({ destino: 'd' }),
      ctx(),
      3,
    )
    expect(rutas).toHaveLength(3)
    expect(new Set(rutas.map(r => r.saltos.join('>'))).size).toBe(3)
    expect(rutas.map(r => r.coste)).toEqual([...rutas.map(r => r.coste)].sort((x, y) => x - y))
    for (const r of rutas) {
      expect(r.saltos[0]).toBe('a')
      expect(r.saltos[r.saltos.length - 1]).toBe('d')
      expect(r.medios).toHaveLength(r.saltos.length - 1)
      expect(new Set(r.saltos).size).toBe(r.saltos.length)
    }
    expect(rutas[0].saltos).toEqual(['a', 'b', 'd'])
  })

  it('devuelve [] cuando no hay ninguna ruta apta', () => {
    const senales = [senal('a', 'b'), senal('c', 'd')]
    const rutas = mejoresRutas(cristal([['a', 'b'], ['c', 'd']]), reticula(senales), dato({ destino: 'd' }), ctx(), 3)
    expect(rutas).toEqual([])
  })

  it('en difusión (destino null) devuelve un salto por vecino directo', () => {
    const senales = [senal('a', 'b'), senal('a', 'c'), senal('a', 'x')]
    const rutas = mejoresRutas(
      cristal([['a', 'b'], ['a', 'c'], ['a', 'x']]),
      reticula(senales),
      dato({ clase: 'interno', destino: null }),
      ctx(['x']),
      3,
    )
    expect(rutas.map(r => r.saltos)).toEqual([['a', 'b'], ['a', 'c']])
    expect(rutas.every(r => r.saltos.length === 2)).toBe(true)
  })
})
