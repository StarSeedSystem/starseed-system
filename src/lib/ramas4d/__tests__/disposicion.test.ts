import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  calcularPeticion,
  type PeticionDisposicion,
} from '../disposicion.worker';
import {
  calcularDisposicion,
  calcularEnHiloPrincipal,
  tipoDisposicionValido,
} from '../use-disposicion';
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

describe('tipoDisposicionValido', () => {
  it('acepta los cuatro tipos válidos', () => {
    expect(tipoDisposicionValido('fuerza')).toBe(true);
    expect(tipoDisposicionValido('radial')).toBe(true);
    expect(tipoDisposicionValido('espiral')).toBe(true);
    expect(tipoDisposicionValido('planos')).toBe(true);
  });

  it('rechaza tipos inválidos', () => {
    expect(tipoDisposicionValido('invalido')).toBe(false);
    expect(tipoDisposicionValido('')).toBe(false);
    expect(tipoDisposicionValido('fuerza2')).toBe(false);
  });
});

describe('calcularPeticion (worker puro)', () => {
  function cadena(n: number): AristaDisposicion[] {
    const aristas: AristaDisposicion[] = [];
    for (let i = 0; i < n - 1; i++) aristas.push({ de: i, a: i + 1, intensidad: 1 });
    return aristas;
  }

  it('calcula disposición por fuerzas', () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 10, aristas: cadena(10), opciones: { semilla: 1, iteraciones: 10 } };
    const posiciones = calcularPeticion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(30);
  });

  it('calcula disposición radial', () => {
    const peticion: PeticionDisposicion = { modo: 'radial', padres: [-1, 0, 0, 1] };
    const posiciones = calcularPeticion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(12);
    expect(posiciones[0]).toBe(0);
    expect(posiciones[1]).toBe(0);
    expect(posiciones[2]).toBe(0);
  });

  it('calcula disposición espiral temporal', () => {
    const peticion: PeticionDisposicion = { modo: 'espiral', tiempos: [0, 1, 2, 3] };
    const posiciones = calcularPeticion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(12);
  });

  it('calcula disposición planos por capa', () => {
    const peticion: PeticionDisposicion = { modo: 'planos', capas: ['a', 'a', 'b'] };
    const posiciones = calcularPeticion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(9);
  });

  it('es determinista con la misma semilla', () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 8, aristas: cadena(8), opciones: { semilla: 42, iteraciones: 50 } };
    const a = calcularPeticion(peticion);
    const b = calcularPeticion(peticion);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('calcularDisposicion (integración worker/hilo)', () => {
  function cadena(n: number): AristaDisposicion[] {
    const aristas: AristaDisposicion[] = [];
    for (let i = 0; i < n - 1; i++) aristas.push({ de: i, a: i + 1, intensidad: 1 });
    return aristas;
  }

  it('calcula disposición por fuerzas en hilo principal (fallback)', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 12, aristas: cadena(12), opciones: { semilla: 7, iteraciones: 20 } };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(36);
  });

  it('calcula disposición radial en hilo principal', async () => {
    const peticion: PeticionDisposicion = { modo: 'radial', padres: [-1, 0, 1, 0] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(12);
  });

  it('calcula disposición espiral en hilo principal', async () => {
    const peticion: PeticionDisposicion = { modo: 'espiral', tiempos: [0, 10, 20] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(9);
  });

  it('calcula disposición planos en hilo principal', async () => {
    const peticion: PeticionDisposicion = { modo: 'planos', capas: ['a', 'b', 'a'] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(9);
  });

  it('es determinista con la misma semilla', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 10, aristas: cadena(10), opciones: { semilla: 99, iteraciones: 30 } };
    const a = await calcularDisposicion(peticion);
    const b = await calcularDisposicion(peticion);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('calcularEnHiloPrincipal es función pura y determinista', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 6, aristas: cadena(6), opciones: { semilla: 5, iteraciones: 15 } };
    const a = await calcularEnHiloPrincipal(peticion);
    const b = await calcularEnHiloPrincipal(peticion);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('calcularDisposicion fallback a hilo principal (sin Worker)', () => {
  let WorkerOriginal: typeof Worker | undefined;

  beforeEach(() => {
    WorkerOriginal = globalThis.Worker;
    vi.stubGlobal('Worker', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (WorkerOriginal) {
      globalThis.Worker = WorkerOriginal;
    }
  });

  function cadena(n: number): AristaDisposicion[] {
    const aristas: AristaDisposicion[] = [];
    for (let i = 0; i < n - 1; i++) aristas.push({ de: i, a: i + 1, intensidad: 1 });
    return aristas;
  }

  it('calcula disposición por fuerzas en hilo principal cuando no hay Worker', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 12, aristas: cadena(12), opciones: { semilla: 7, iteraciones: 20 } };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(36);
  });

  it('calcula disposición radial en hilo principal cuando no hay Worker', async () => {
    const peticion: PeticionDisposicion = { modo: 'radial', padres: [-1, 0, 1, 0] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(12);
  });

  it('calcula disposición espiral en hilo principal cuando no hay Worker', async () => {
    const peticion: PeticionDisposicion = { modo: 'espiral', tiempos: [0, 10, 20] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(9);
  });

  it('calcula disposición planos en hilo principal cuando no hay Worker', async () => {
    const peticion: PeticionDisposicion = { modo: 'planos', capas: ['a', 'b', 'a'] };
    const posiciones = await calcularDisposicion(peticion);
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(9);
  });

  it('produce resultados idénticos a calcularEnHiloPrincipal directo', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 10, aristas: cadena(10), opciones: { semilla: 42, iteraciones: 30 } };
    const viaFallback = await calcularDisposicion(peticion);
    const directo = await calcularEnHiloPrincipal(peticion);
    expect(Array.from(viaFallback)).toEqual(Array.from(directo));
  });

  it('es determinista en el fallback con la misma semilla', async () => {
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: 10, aristas: cadena(10), opciones: { semilla: 99, iteraciones: 30 } };
    const a = await calcularDisposicion(peticion);
    const b = await calcularDisposicion(peticion);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
