import { describe, it, expect } from 'vitest'
import { distanciaPorSenal, multilateracion, posicionesEstimadas } from '../geometria'
import { Medio, NeuronaReticula, SenalMedida } from '../tipos'

describe('distanciaPorSenal', () => {
  it('should return null for unknown medio', () => {
    const s = { de: 'a', a: 'b', medio: 'unknown' as Medio, rssiDbm: -50, snrDb: 10 }
    expect(distanciaPorSenal(s)).toBeNull()
  })

  it('should calculate distance for wifi-lan', () => {
    const s = { de: 'a', a: 'b', medio: 'wifi-lan', rssiDbm: -40 } // at reference power, distance should be 1m
    expect(distanciaPorSenal(s)).toBeCloseTo(1, 2)
  })

  it('should calculate distance for ble', () => {
    const s = { de: 'a', a: 'b', medio: 'ble', rssiDbm: -59 } // at reference power, distance should be 1m
    expect(distanciaPorSenal(s)).toBeCloseTo(1, 2)
  })

  it('should clamp distance to [1, 300] for wifi-lan', () => {
    // Very strong signal -> distance < 1, should clamp to 1
    const s1 = { de: 'a', a: 'b', medio: 'wifi-lan', rssiDbm: -20 }
    expect(distanciaPorSenal(s1)).toBeCloseTo(1, 2)
    // Very weak signal -> distance > 300, should clamp to 300
    const s2 = { de: 'a', a: 'b', medio: 'wifi-lan', rssiDbm: -110 }
    expect(distanciaPorSenal(s2)).toBeCloseTo(300, 2)
  })

  it('should calculate distance for lora based on snr', () => {
    const s1 = { de: 'a', a: 'b', medio: 'lora', snrDb: 10 } // >=10 -> 500m
    expect(distanciaPorSenal(s1)).toBeCloseTo(500, 2)
    const s2 = { de: 'a', a: 'b', medio: 'lora', snrDb: -20 } // <=-20 -> 15000m
    expect(distanciaPorSenal(s2)).toBeCloseTo(15000, 2)
    const s3 = { de: 'a', a: 'b', medio: 'lora', snrDb: 0 } // middle -> should be (500+15000)/2? Let's compute: linear interpolation
    // At snr=0, which is midpoint between -20 and 10? Actually, the range is 30 units (from -20 to 10). 0 is 20 units above -20 -> fraction 20/30 = 2/3 from -20 to 10.
    // So distance = 15000 - (15000-500)*(20/30) = 15000 - 14500*(2/3) = 15000 - 9666.67 = 5333.33
    expect(distanciaPorSenal(s3)).toBeCloseTo(500 + (15000-500)*(10-0)/30, 2)
  })

  it('should return 0.1 for nfc', () => {
    const s = { de: 'a', a: 'b', medio: 'nfc' }
    expect(distanciaPorSenal(s)).toBeCloseTo(0.1, 2)
  })

  it('should return null for webrtc, servidor, reticulum, serie', () => {
    const medios: Medio[] = ['webrtc', 'servidor', 'reticulum', 'serie']
    for (const m of medios) {
      const s = { de: 'a', a: 'b', medio: m }
      expect(distanciaPorSenal(s)).toBeNull()
    }
  })
})

describe('multilateracion', () => {
  it('should return null for less than 3 anchors', () => {
    const anchors = [
      { x: 0, y: 0, d: 1 },
      { x: 1, y: 0, d: 1 }
    ]
    expect(multilateracion(anchors)).toBeNull()
  })

  it('should compute position for three anchors with known distances', () => {
    // Three anchors at (0,0), (0,3), (4,0) and distances to point (1,1) are sqrt(2), sqrt(5), sqrt(10)
    const anchors = [
      { x: 0, y: 0, d: Math.sqrt(2) },
      { x: 0, y: 3, d: Math.sqrt(5) },
      { x: 4, y: 0, d: Math.sqrt(10) }
    ]
    const result = multilateracion(anchors)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.x).toBeCloseTo(1, 2)
      expect(result.y).toBeCloseTo(1, 2)
    }
  })
})

describe('posicionesEstimadas', () => {
  it('should keep existing positions and estimate others', () => {
    const neuronas: NeuronaReticula[] = [
      { id: '1', cuenta: 'c1', posicion: { x: 0, y: 0, precisionM: 1 }, capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] },
      { id: '2', cuenta: 'c1', posicion: { x: 3, y: 0, precisionM: 1 }, capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] },
      { id: '3', cuenta: 'c1', capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] } // no posicion
    ]
    const senales: SenalMedida[] = [
      { de: '1', a: '3', medio: 'wifi-lan', rssiDbm: -40 }, // distance 1m
      { de: '2', a: '3', medio: 'wifi-lan', rssiDbm: -40 }  // distance 1m
    ]
    // We have two anchors, but we need at least three for multilateration -> so it will fall back to the circle.
    // However, note: we have two known neurons (1 and 2) and we are trying to locate 3.
    // The centroid of known positions: ( (0+3)/2, (0+0)/2 ) = (1.5, 0)
    // The circle radius 50 -> but wait, we only have two anchors, so we cannot do multilateration -> fallback.
    // The fallback will place neuron 3 on a circle of radius 50 around (1.5,0). But note: we have two neurons without position? Only one.
    // So the angle for the only neuron without position: index=0, total=1 -> angle=0 -> point at (1.5+50, 0) = (51.5, 0)
    // However, the actual position of neuron 3 should be at (1.5, sqrt(1^2 - (1.5)^2)? Actually, we have two distance constraints: 
    //   distance to 1: 1 -> circle around (0,0) radius 1
    //   distance to 2: 1 -> circle around (3,0) radius 1
    // The intersection points are (1.5, sqrt(1 - (1.5)^2)? -> (1.5, sqrt(1-2.25)) -> imaginary. So no solution? 
    // Actually, the distance between neuron1 and neuron2 is 3, and we have distances 1 and 1 -> 1+1 < 3 -> no intersection.
    // So the fallback is used.

    const result = posicionesEstimadas(neuronas, senales)
    expect(result['1']).toEqual({ x: 0, y: 0, estimada: false })
    expect(result['2']).toEqual({ x: 3, y: 0, estimada: false })
    expect(result['3']).toHaveProperty('estimada', true)
    // We don't check the exact position because it depends on the fallback, but we can check that it's not the same as the known ones.
    expect(result['3']).not.toEqual({ x: 0, y: 0, estimada: true })
    expect(result['3']).not.toEqual({ x: 3, y: 0, estimada: true })
  })

  it('should estimate position with three anchors', () => {
    const neuronas: NeuronaReticula[] = [
      { id: '1', cuenta: 'c1', posicion: { x: 0, y: 0, precisionM: 1 }, capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] },
      { id: '2', cuenta: 'c1', posicion: { x: 0, y: 3, precisionM: 1 }, capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] },
      { id: '3', cuenta: 'c1', posicion: { x: 4, y: 0, precisionM: 1 }, capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] },
      { id: '4', cuenta: 'c1', capacidad: { ramGb: 8, bateriaPct: 80, cargando: false }, medios: [] } // to locate
    ]
    // Point (1,1) has distances:
    // to (0,0): sqrt(2)
    // to (0,3): sqrt(5)
    // to (4,0): sqrt(10)
    const senales: SenalMedida[] = [
      { de: '1', a: '4', medio: 'wifi-lan', rssiDbm: -40 - 27 * Math.log10(Math.sqrt(2)) },
      { de: '2', a: '4', medio: 'wifi-lan', rssiDbm: -40 - 27 * Math.log10(Math.sqrt(5)) },
      { de: '3', a: '4', medio: 'wifi-lan', rssiDbm: -40 - 27 * Math.log10(Math.sqrt(10)) }
    ]
    const result = posicionesEstimadas(neuronas, senales)
    expect(result['4']).toHaveProperty('estimada', true)
    if (result['4']) {
      expect(result['4'].x).toBeCloseTo(1, 2)
      expect(result['4'].y).toBeCloseTo(1, 2)
    }
  })
})