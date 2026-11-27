import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  crearEstadoFuerza,
  disposicionEspiralTemporal,
  disposicionFuerza,
  disposicionPlanosPorCapa,
  disposicionRadial,
  energiaDisposicion,
  pasoFuerza,
  type AristaDisposicion,
} from '../disposicion';
import { useDisposicion, calcularPeticion } from '../use-disposicion';

function cadena(n: number): AristaDisposicion[] {
  const aristas: AristaDisposicion[] = [];
  for (let i = 0; i < n - 1; i++) aristas.push({ de: i, a: i + 1, intensidad: 1 });
  return aristas;
}

function distancia(posiciones: Float32Array, i: number, j: number): number {
  const dx = posiciones[j * 3] - posiciones[i * 3];
  const dy = posiciones[j * 3 + 1] - posiciones[i * 3 + 1];
  const dz = posiciones[j * 3 + 2] - posiciones[i * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe('disposicion por fuerzas', () => {
  it('es determinista con la misma semilla y cambia con otra', () => {
    const aristas = cadena(12);
    const a = disposicionFuerza(12, aristas, { semilla: 7, iteraciones: 12 });
    const b = disposicionFuerza(12, aristas, { semilla: 7, iteraciones: 12 });
    const c = disposicionFuerza(12, aristas, { semilla: 8, iteraciones: 12 });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('converge a una energía menor que la inicial', () => {
    const aristas = cadena(10);
    const opciones = { semilla: 3, iteraciones: 250 };
    const inicial = crearEstadoFuerza(10, opciones).posiciones;
    const final = disposicionFuerza(10, aristas, opciones);
    expect(energiaDisposicion(final, aristas, opciones)).toBeLessThan(
      energiaDisposicion(inicial, aristas, opciones),
    );
  });

  it('acerca las aristas a su longitud de reposo', () => {
    const aristas = cadena(8);
    const opciones = { semilla: 5, iteraciones: 300, longitudResorte: 2 };
    const posiciones = disposicionFuerza(8, aristas, opciones);
    let desvio = 0;
    for (const arista of aristas) {
      desvio += Math.abs(distancia(posiciones, arista.de, arista.a) - 2);
    }
    expect(desvio / aristas.length).toBeLessThan(1.5);
  });

  it('procesa 5000 nodos en un paso por debajo de 200 ms', () => {
    const n = 5000;
    const aristas = cadena(n);
    const estado = crearEstadoFuerza(n, { semilla: 1 });
    const inicio = performance.now();
    pasoFuerza(estado, aristas, { semilla: 1 });
    const ms = performance.now() - inicio;
    expect(ms).toBeLessThan(200);
  });
});

describe('disposicion radial', () => {
  it('pone la raíz en el origen y separa los niveles', () => {
    const posiciones = disposicionRadial([-1, 0, 0, 1], {
      radioAnillo: 2,
      alturaAnillo: 1,
    });
    expect(posiciones[0]).toBe(0);
    expect(posiciones[1]).toBe(0);
    expect(posiciones[2]).toBe(0);
    expect(Math.hypot(posiciones[3], posiciones[5])).toBeCloseTo(2, 5);
    expect(Math.hypot(posiciones[9], posiciones[11])).toBeCloseTo(4, 5);
    expect(posiciones[4]).toBeCloseTo(1, 5);
    expect(posiciones[10]).toBeCloseTo(2, 5);
  });

  it('es determinista y tolera ciclos', () => {
    const padres = [-1, 0, 1, 0, 3];
    const a = disposicionRadial(padres);
    const b = disposicionRadial(padres);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(padres.length * 3);
  });
});

describe('disposicion espiral temporal', () => {
  it('coloca el tiempo en z y aumenta el radio', () => {
    const posiciones = disposicionEspiralTemporal([0, 1, 2, 3], { altura: 6 });
    expect(posiciones[2]).toBeCloseTo(0, 5);
    expect(posiciones[5]).toBeCloseTo(2, 5);
    expect(posiciones[8]).toBeCloseTo(4, 5);
    expect(posiciones[11]).toBeCloseTo(6, 5);
    const r0 = Math.hypot(posiciones[0], posiciones[1]);
    const r3 = Math.hypot(posiciones[9], posiciones[10]);
    expect(r3).toBeGreaterThan(r0);
  });

  it('es determinista y reparte tiempos iguales', () => {
    const a = disposicionEspiralTemporal([5, 5, 5]);
    const b = disposicionEspiralTemporal([5, 5, 5]);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Math.hypot(a[0], a[1])).not.toBeCloseTo(Math.hypot(a[6], a[7]), 5);
  });
});

describe('disposicion planos por capa', () => {
  it('una capa por altura y orden determinista', () => {
    const posiciones = disposicionPlanosPorCapa(['a', 'a', 'b', 'c'], { separacion: 2 });
    expect(posiciones[2]).toBe(0);
    expect(posiciones[5]).toBe(0);
    expect(posiciones[8]).toBeCloseTo(2, 5);
    expect(posiciones[11]).toBeCloseTo(4, 5);
  });

  it('ordena capas numéricas por valor, no por texto', () => {
    const posiciones = disposicionPlanosPorCapa([2, 10], { separacion: 1 });
    expect(posiciones[2]).toBe(0);
    expect(posiciones[5]).toBeCloseTo(1, 5);
  });

  it('es determinista', () => {
    const a = disposicionPlanosPorCapa(['x', 'y', 'x']);
    const b = disposicionPlanosPorCapa(['x', 'y', 'x']);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('useDisposicion hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve estado inicial correcto', () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'fuerza',
        datos: { n: 4, aristas: [{ de: 0, a: 1, intensidad: 1 }], opciones: { iteraciones: 2 } },
        auto: false,
        usarWorker: false,
      }),
    );

    expect(result.current.posiciones).toBeNull();
    expect(result.current.calculando).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.ms).toBeNull();
  });

  it('calcula disposición por fuerzas en hilo principal (fallback)', async () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'fuerza',
        datos: { n: 4, aristas: [{ de: 0, a: 1, intensidad: 1 }], opciones: { iteraciones: 2, semilla: 42 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await result.current.calcular();
    });

    expect(result.current.calculando).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.posiciones).toBeInstanceOf(Float32Array);
    expect(result.current.posiciones!.length).toBe(12);
    expect(result.current.ms).toBeGreaterThanOrEqual(0);
  });

  it('calcula disposición radial en hilo principal', async () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'radial',
        datos: { padres: [-1, 0, 0, 1], opciones: { radioAnillo: 2, alturaAnillo: 1 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await result.current.calcular();
    });

    expect(result.current.posiciones).toBeInstanceOf(Float32Array);
    expect(result.current.posiciones!.length).toBe(12);
    expect(result.current.posiciones![0]).toBe(0);
    expect(result.current.posiciones![1]).toBe(0);
    expect(result.current.posiciones![2]).toBe(0);
  });

  it('calcula disposición espiral temporal en hilo principal', async () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'espiral',
        datos: { tiempos: [0, 1, 2, 3], opciones: { altura: 6 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await result.current.calcular();
    });

    expect(result.current.posiciones).toBeInstanceOf(Float32Array);
    expect(result.current.posiciones!.length).toBe(12);
    expect(result.current.posiciones![2]).toBeCloseTo(0, 5);
    expect(result.current.posiciones![11]).toBeCloseTo(6, 5);
  });

  it('calcula disposición planos por capa en hilo principal', async () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'planos',
        datos: { capas: ['a', 'a', 'b', 'c'], opciones: { separacion: 2 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await result.current.calcular();
    });

    expect(result.current.posiciones).toBeInstanceOf(Float32Array);
    expect(result.current.posiciones!.length).toBe(12);
    expect(result.current.posiciones![2]).toBe(0);
    expect(result.current.posiciones![8]).toBeCloseTo(2, 5);
  });

  it('es determinista con la misma semilla en modo fuerza', async () => {
    const aristas = [{ de: 0, a: 1, intensidad: 1 }, { de: 1, a: 2, intensidad: 1 }];

    const { result: r1 } = renderHook(() =>
      useDisposicion({
        modo: 'fuerza',
        datos: { n: 3, aristas, opciones: { iteraciones: 10, semilla: 7 } },
        auto: false,
        usarWorker: false,
      }),
    );

    const { result: r2 } = renderHook(() =>
      useDisposicion({
        modo: 'fuerza',
        datos: { n: 3, aristas, opciones: { iteraciones: 10, semilla: 7 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await Promise.all([r1.current.calcular(), r2.current.calcular()]);
    });

    expect(Array.from(r1.current.posiciones!)).toEqual(Array.from(r2.current.posiciones!));
  });

  it('maneja errores en cálculo', async () => {
    const { result } = renderHook(() =>
      useDisposicion({
        modo: 'fuerza',
        datos: { n: -1, aristas: [], opciones: { iteraciones: 2 } },
        auto: false,
        usarWorker: false,
      }),
    );

    await act(async () => {
      await result.current.calcular();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.calculando).toBe(false);
  });

  it('recalcula cuando cambian los datos con auto=true', async () => {
    const { result, rerender } = renderHook(
      ({ n }) =>
        useDisposicion({
          modo: 'fuerza',
          datos: { n, aristas: [], opciones: { iteraciones: 2, semilla: 1 } },
          auto: true,
          usarWorker: false,
        }),
      { initialProps: { n: 2 } },
    );

    await waitFor(() => expect(result.current.calculando).toBe(false));
    const pos1 = result.current.posiciones;

    rerender({ n: 4 });

    await waitFor(() => expect(result.current.calculando).toBe(false));
    expect(result.current.posiciones).not.toBe(pos1);
    expect(result.current.posiciones!.length).toBe(12);
  });
});
