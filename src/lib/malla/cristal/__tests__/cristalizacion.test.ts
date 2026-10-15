import { describe, it, expect } from 'vitest';
import {
  temperaturaDe,
  estadoDe,
  coordinacionObjetivo,
  medioCompartidoMaxCapacidad,
  distancia,
  generarCandidatos,
  kruskal,
  agregarPuentesTriangulo,
  cristalizar,
  type Cristal,
  type Medio,
  type NeuronaReticula,
  type SenalMedida,
  type Tesela,
  type Reticula,
  type Puente,
  type EstadoVitreo,
} from '../cristalizacion';
import { senalesDeReticula, huellaReticula, crearTesela, fusionarTodas } from '../teselas';
import { coordinacionDe } from '../cristalizacion';

// Helper to create a neurona
function crearNeurona(id: string, cuenta: string, esRouter = false, posicion: { x: number; y: number; precisionM?: number } = { x: 0, y: 0, precisionM: 10 }): NeuronaReticula {
  return {
    id,
    cuenta,
    esRouter,
    posicion: {
      x: posicion.x,
      y: posicion.y,
      precisionM: posicion.precisionM ?? 10,
    },
    capacidad: {
      ramGb: 8,
      bateriaPct: 50,
      cargando: false,
    },
    medios: ['webrtc', 'wifi-lan', 'ble', 'lora'] as Medio[],
  };
}

// Helper to create a señal
function createSenal(
  de: string,
  a: string,
  medio: Medio,
  rssiDbm: number = -50,
  snrDb: number = 20,
  rttMs: number = 50,
  anchoBandaKbps: number = 1000,
  perdidaPct: number = 0,
  frecuenciaMhz: number = 2400,
  anchoCanalMhz: number = 20,
  vistaEn: number = 1000
): SenalMedida {
  return {
    de,
    a,
    medio,
    rssiDbm,
    snrDb,
    rttMs,
    anchoBandaKbps,
    perdidaPct,
    frecuenciaMhz,
    anchoCanalMhz,
    vistaEn,
  };
}

describe('temperaturaDe', () => {
  it('should return 0.5 for empty history', () => {
    const hist: Array<{ clave: string; t: number; calidad: number }> = [];
    const result = temperaturaDe(hist, 120000, 1000);
    expect(result).toEqual({});
  });

  it('should return 0.5 for single entry', () => {
    const hist = [{ clave: 'n1', t: 1000, calidad: 0.8 }];
    const result = temperaturaDe(hist, 120000, 2000);
    expect(result.n1).toBeCloseTo(0.5);
  });

  it('should compute temperature correctly', () => {
    const now = 2000;
    const hist = [
      { clave: 'n1', t: 1000, calidad: 0.5 },
      { clave: 'n1', t: 1100, calidad: 0.5 },
      { clave: 'n1', t: 1200, calidad: 0.5 },
    ];
    const result = temperaturaDe(hist, 120000, now);
    // std = 0 -> temp = 0.5
    expect(result.n1).toBeCloseTo(0.5);
  });

  it('should increase temperature with higher std', () => {
    const now = 2000;
    const hist = [
      { clave: 'n1', t: 1000, calidad: 0.0 },
      { clave: 'n1', t: 1100, calidad: 1.0 },
      { clave: 'n1', t: 1200, calidad: 0.0 },
    ];
    const result = temperaturaDe(hist, 120000, now);
    // std = 0.5 -> temp = min(1, 0.5 + 0.5*2) = min(1, 1.5) = 1.0
    expect(result.n1).toBeCloseTo(1.0);
  });
});

describe('estadoDe', () => {
  it('should return fundido for temp >= 0.6', () => {
    expect(estadoDe(0.6)).toBe('fundido');
    expect(estadoDe(0.8)).toBe('fundido');
  });

  it('should return subenfriado for temp >= 0.25 and < 0.6', () => {
    expect(estadoDe(0.25)).toBe('subenfriado');
    expect(estadoDe(0.5)).toBe('subenfriado');
  });

  it('should return vitreo for temp < 0.25', () => {
    expect(estadoDe(0.0)).toBe('vitreo');
    expect(estadoDe(0.2)).toBe('vitreo');
  });
});

describe('coordinacionObjetivo', () => {
  const neurona: NeuronaReticula = crearNeurona('n1', 'c1');

  it('should return base coordination for router', () => {
    const router = { ...neurona, esRouter: true };
    expect(coordinacionObjetivo(router, 0.5)).toBe(6); // base for router is 6
  });

  it('should return base coordination for non-router with good battery', () => {
    expect(coordinacionObjetivo(neurona, 0.5)).toBe(4);
  });

  it('should return 2 for low battery and not charging', () => {
    const lowBat = { ...neurona, capacidad: { ...neurona.capacidad, bateriaPct: 10, cargando: false } };
    expect(coordinacionObjetivo(lowBat, 0.5)).toBe(2);
  });

  it('should return 3 for low ram', () => {
    const lowRam = { ...neurona, capacidad: { ...neurona.capacidad, ramGb: 1 } };
    expect(coordinacionObjetivo(lowRam, 0.5)).toBe(3);
  });

  it('should increase coordination when hot', () => {
    expect(coordinacionObjetivo(neurona, 0.7)).toBe(5); // 4 + 1
  });

  it('should decrease coordination when best remaining candidate cost > 0.7', () => {
    expect(coordinacionObjetivo(neurona, 0.5, 0.8)).toBe(3); // 4 - 1
  });

  it('should not go below 1', () => {
    const router = { ...neurona, esRouter: true };
    expect(coordinacionObjetivo(router, 0.0, 0.8)).toBe(Math.max(1, 6 - 1)); // 5
    // extreme case: router, hot, and high cost -> 6+1-1=6
    expect(coordinacionObjetivo(router, 0.7, 0.8)).toBe(6);
    // router, cold, high cost -> 6-1=5
    expect(coordinacionObjetivo(router, 0.0, 0.8)).toBe(5);
  });
});

describe('medioCompartidoMaxCapacidad', () => {
  it('should return undefined for no common medium', () => {
    expect(medioCompartidoMaxCapacidad(['lora'], ['ble'])).toBeUndefined();
  });

  it('should return the common medium with highest capacity', () => {
    const mediosA = ['lora', 'ble', 'wifi-lan'] as Medio[];
    const mediosB = ['ble', 'webrtc'] as Medio[];
    // Common medium is ble (capacity 1000) vs webrtc (not in A) and wifi-lan (not in B) and lora (not in B)
    // So only ble is common -> capacity 1000
    expect(medioCompartidoMaxCapacidad(mediosA, mediosB)).toBe('ble');
  });

  it('should return webrtc if both have it and it has higher capacity than ble', () => {
    const mediosA = ['webrtc', 'ble'] as Medio[];
    const mediosB = ['webrtc', 'lora'] as Medio[];
    expect(medioCompartidoMaxCapacidad(mediosA, mediosB)).toBe('webrtc'); // capacity 20000 > 1000
  });
});

describe('distancia', () => {
  it('should compute Euclidean distance', () => {
    expect(distancia({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distancia({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
  });
});

describe('generarCandidatos', () => {
  it('should generate candidates from signals', () => {
    const neuronaA = crearNeurona('A', 'c1');
    const neuronaB = crearNeurona('B', 'c1');
    const teselaA = crearTesela(neuronaA, [createSenal('A', 'B', 'webrtc')], 100);
    const teselaB = crearTesela(neuronaB, [createSenal('B', 'A', 'webrtc')], 100);
    const reticula = fusionarTodas([teselaA, teselaB]);
    const confianza: Record<string, number> = { A: 1, B: 1 };
    const candidatos = generarCandidatos(reticula, confianza);
    expect(candidatos.length).toBe(1);
    expect(candidatos[0]).toEqual({
      a: 'A',
      b: 'B',
      medio: 'webrtc',
      coste: expect.any(Number),
    });
  });

  it('should generate Delaunay candidates when in range', () => {
    // Two neurons with position, no signal, within ble range (50m)
    const neuronaA = { ...crearNeurona('A', 'c1', false, { x: 0, y: 0 }), medios: ['ble', 'lora'] as Medio[] };
    const neuronaB = { ...crearNeurona('B', 'c1', false, { x: 0, y: 30 }), medios: ['ble', 'lora'] as Medio[] }; // 30m apart
    const teselaA = crearTesela(neuronaA, [], 100);
    const teselaB = crearTesela(neuronaB, [], 100);
    const reticula = fusionarTodas([teselaA, teselaB]);
    const confianza: Record<string, number> = { A: 1, B: 1 };
    const candidatos = generarCandidatos(reticula, confianza);
    // We expect one candidate via ble (since both have ble and distance 30 < 50)
    expect(candidatos.length).toBe(1);
    expect(candidatos[0].medio).toBe('ble');
    expect(candidatos[0].coste).toBeGreaterThan(0);
  });

  it('should not generate Delaunay candidate when out of range', () => {
    const neuronaA = { ...crearNeurona('A', 'c1', false, { x: 0, y: 0 }), medios: ['ble', 'lora'] as Medio[] };
    const neuronaB = { ...crearNeurona('B', 'c1', false, { x: 0, y: 60 }), medios: ['ble', 'lora'] as Medio[] }; // 60m > 50 (ble)
    const teselaA = crearTesela(neuronaA, [], 100);
    const teselaB = crearTesela(neuronaB, [], 100);
    const reticula = fusionarTodas([teselaA, teselaB]);
    const confianza: Record<string, number> = { A: 1, B: 1 };
    const candidatos = generarCandidatos(reticula, confianza);
    expect(candidatos.length).toBe(0);
  });
});

describe('kruskal', () => {
  it('should return empty array for no candidates', () => {
    const candidatos: Puente[] = [];
    const neuronasIds = new Set(['A', 'B']);
    expect(kruskal(candidatos, neuronasIds)).toEqual([]);
  });

  it('should return a spanning tree', () => {
    const candidatos: Puente[] = [
      { a: 'A', b: 'B', medio: 'webrtc', coste: 1 },
      { a: 'B', b: 'C', medio: 'webrtc', coste: 2 },
      { a: 'A', b: 'C', medio: 'webrtc', coste: 4 },
    ];
    const neuronasIds = new Set(['A', 'B', 'C']);
    const result = kruskal(candidatos, neuronasIds);
    expect(result.length).toBe(2);
    // Should pick the two cheapest
    expect(result.some(p => p.coste === 1 && ((p.a === 'A' && p.b === 'B') || (p.a === 'B' && p.b === 'A')))).toBeTruthy();
    expect(result.some(p => p.coste === 2 && ((p.a === 'B' && p.b === 'C') || (p.a === 'C' && p.b === 'B')))).toBeTruthy();
  });
});

describe('agregarPuentesTriangulo', () => {
  it('should not add any bridge if coordination limits are reached', () => {
    const puentesPuentes: Puente[] = [
      { a: 'A', b: 'B', medio: 'webrtc', coste: 1 },
      { a: 'B', b: 'C', medio: 'webrtc', coste: 1 },
    ];
    const candidatos: Puente[] = [
      { a: 'A', b: 'C', medio: 'webrtc', coste: 1 }, // would form triangle
    ];
    const neuronas: Record<string, NeuronaReticula> = {
      A: crearNeurona('A', 'c1'),
      B: crearNeurona('B', 'c1'),
      C: crearNeurona('C', 'c1'),
    };
    const temperaturas: Record<string, number> = { A: 0.5, B: 0.5, C: 0.5 };
    const confianzas: Record<string, number> = { A: 1, B: 1, C: 1 };
    // Coordination objective for each is 4 (non-router, good battery)
    // Currently, A has 1 bridge, B has 2, C has 1.
    // A can have up to 4, so can add more; B has 2 (can add up to 2 more); C has 1.
    // The bridge A-C would make A:2, B:2, C:2 -> all within limits.
    // So it should be added.
    const result = agregarPuentesTriangulo(
      puentesPuentes,
      candidatos,
      neuronas,
      temperaturas,
      confianzas
    );
    expect(result.length).toBe(3);
  });

  it('should respect coordination limits', () => {
    // Set up a scenario where a neuron is at its limit
    const puentesPuentes: Puente[] = [
      { a: 'A', b: 'B', medio: 'webrtc', coste: 1 },
      { a: 'A', b: 'C', medio: 'webrtc', coste: 1 },
      { a: 'A', b: 'D', medio: 'webrtc', coste: 1 }, // A now has 3 bridges
    ];
    const candidatos: Puente[] = [
      { a: 'A', b: 'E', medio: 'webrtc', coste: 1 }, // would make A have 4
    ];
    const neuronas: Record<string, NeuronaReticula> = {
      A: crearNeurona('A', 'c1'),
      B: crearNeurona('B', 'c1'),
      C: crearNeurona('C', 'c1'),
      D: crearNeurona('D', 'c1'),
      E: crearNeurona('E', 'c1'),
    };
    const temperaturas: Record<string, number> = { A: 0.5, B: 0.5, C: 0.5, D: 0.5, E: 0.5 };
    const confianzas: Record<string, number> = { A: 1, B: 1, C: 1, D: 1, E: 1 };
    // Coordination objective for A is 4 (non-router, good battery) -> can have up to 4
    // Currently A has 3, so can add one more -> the bridge A-E should be added.
    const result = agregarPuentesTriangulo(
      puentesPuentes,
      candidatos,
      neuronas,
      temperaturas,
      confianzas
    );
    expect(result.length).toBe(4);
    expect(result.some(p => p.a === 'A' && p.b === 'E')).toBeTruthy();
  });

  it('should not exceed coordination limit', () => {
    // Now make A have 4 bridges already (at limit)
    const puentesPuentes: Puente[] = [
      { a: 'A', b: 'B', medio: 'webrtc', coste: 1 },
      { a: 'A', b: 'C', medio: 'webrtc', coste: 1 },
      { a: 'A', b: 'D', medio: 'webrtc', coste: 1 },
      { a: 'A', b: 'E', medio: 'webrtc', coste: 1 }, // A has 4
    ];
    const candidatos: Puente[] = [
      { a: 'A', b: 'F', medio: 'webrtc', coste: 1 }, // would make A have 5 -> exceed
    ];
    const neuronas: Record<string, NeuronaReticula> = {
      A: crearNeurona('A', 'c1'),
      B: crearNeurona('B', 'c1'),
      C: crearNeurona('C', 'c1'),
      D: crearNeurona('D', 'c1'),
      E: crearNeurona('E', 'c1'),
      F: crearNeurona('F', 'c1'),
    };
    const temperaturas: Record<string, number> = { A: 0.5, B: 0.5, C: 0.5, D: 0.5, E: 0.5, F: 0.5 };
    const confianzas: Record<string, number> = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 };
    const result = agregarPuentesTriangulo(
      puentesPuentes,
      candidatos,
      neuronas,
      temperaturas,
      confianzas
    );
    // Should not add the new bridge
    expect(result.length).toBe(4);
    expect(result.some(p => (p.a === 'A' && p.b === 'F') || (p.a === 'F' && p.b === 'A'))).toBeFalsy();
  });
});

describe('cristalizar', () => {
  it('should return a cristal object', () => {
    const neuronaA = crearNeurona('A', 'c1', false, { x: 0, y: 0 });
    const neuronaB = crearNeurona('B', 'c1', false, { x: 30, y: 0 }); // 30m apart
    const teselaA = crearTesela(neuronaA, [createSenal('A', 'B', 'webrtc')], 100);
    const teselaB = crearTesela(neuronaB, [createSenal('B', 'A', 'webrtc')], 100);
    const reticula = fusionarTodas([teselaA, teselaB]);
    const cristal = cristalizar(reticula, {
      confianza: { A: 1, B: 1 },
      temperatura: { A: 0.5, B: 0.5 },
    });
    expect(cristal).toHaveProperty('puentes');
    expect(cristal).toHaveProperty('estado');
    expect(cristal).toHaveProperty('temperatura');
    expect(cristal).toHaveProperty('huella');
    expect(cristal).toHaveProperty('coordinacion');
    // Should have at least one bridge (the signal)
    expect(cristal.puentes.length).toBeGreaterThan(0);
    // Estado should be vitreo (0.5 average temp -> subenfriado? Actually 0.5 is >=0.25 -> subenfriado)
    // Wait: average temp = (0.5+0.5)/2 = 0.5 -> subenfriado
    expect(cristal.estado).toBe('subenfriado');
    // Coordination: each neuron has two bridges (signal and Delaunay) -> coordination 2
    expect(cristal.coordinacion.A).toBe(2);
    expect(cristal.coordinacion.B).toBe(2);
  });


});