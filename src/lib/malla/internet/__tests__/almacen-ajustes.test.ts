import { describe, it, expect } from 'vitest';
import { leerAjustes, guardarAjustes, AJUSTES_APAGADOS, type Almacen } from '../almacen-ajustes';

describe('AJUSTES_APAGADOS', () => {
  it('todo apagado', () => {
    expect(AJUSTES_APAGADOS.compartirConOtros).toBe(false);
    expect(AJUSTES_APAGADOS.banco.activo).toBe(false);
    expect(AJUSTES_APAGADOS.banco.modo).toBe('diario');
    expect(AJUSTES_APAGADOS.banco.diarioMb).toBe(0);
    expect(AJUSTES_APAGADOS.banco.ventanas).toHaveLength(0);
    expect(AJUSTES_APAGADOS.porAudiencia['mi-cuenta'].mesh).toBe(false);
    expect(AJUSTES_APAGADOS.porAudiencia['mi-cuenta'].limiteMeshMb).toBe(null);
    expect(AJUSTES_APAGADOS.porAudiencia['entidad'].mesh).toBe(false);
    expect(AJUSTES_APAGADOS.porAudiencia['publico'].mesh).toBe(false);
    expect(AJUSTES_APAGADOS.declaraLimitada).toBe(null);
    expect(AJUSTES_APAGADOS.compartirMedidas).toBe(false);
  });
});

describe('leerAjustes', () => {
  const crearAlmacen = (valores: Record<string, string> = {}): Almacen => ({
    getItem: (k) => valores[k] ?? null,
    setItem: () => true,
  });

  it('sin dato → devuelve defectos', () => {
    const almacen = crearAlmacen({});
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toEqual(AJUSTES_APAGADOS);
  });

  it('JSON roto → devuelve defectos', () => {
    const almacen = crearAlmacen({ 'starseed.malla.internet.v1': 'no es json' });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toEqual(AJUSTES_APAGADOS);
  });

  it('versión distinta → devuelve defectos', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({ version: 2, compartirConOtros: true }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toEqual(AJUSTES_APAGADOS);
  });

  it('versión 1 válida parcial → completa con defectos campo a campo', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: true,
        banco: { activo: true, modo: 'diario', diarioMb: 100, ventanas: [] },
        porAudiencia: {
          'mi-cuenta': { mesh: true, limiteMeshMb: 50 },
          'entidad': { mesh: false, limiteMeshMb: null },
          'publico': { mesh: true, limiteMeshMb: 100 },
        },
        declaraLimitada: false,
        compartirMedidas: true,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.version).toBe(1);
    expect(r.compartirConOtros).toBe(true);
    expect(r.banco.activo).toBe(true);
    expect(r.banco.modo).toBe('diario');
    expect(r.banco.diarioMb).toBe(100);
    expect(r.declaraLimitada).toBe(false);
    expect(r.compartirMedidas).toBe(true);
  });

  it('campo inválido: compartirConOtros no boolean → sustituye por defecto (false)', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: 'no-boolean',
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.compartirConOtros).toBe(false);
  });

  it('campo inválido: diarioMb negativo → sustituye por defecto (0)', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'diario', diarioMb: -50, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.diarioMb).toBe(0);
  });

  it('campo inválido: diarioMb no finito (Infinity) → sustituye por defecto', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'diario', diarioMb: Infinity, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.diarioMb).toBe(0);
  });

  it('campo inválido: modo no "diario|programado" → sustituye por defecto ("diario")', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'otro' as any, diarioMb: 0, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.modo).toBe('diario');
  });

  it('campo inválido: ventana con hora no "HH:MM" → se elimina', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas: [{ desde: '2024-01-01', hasta: '2024-01-02', horaDesde: '9:00', horaHasta: '18:00', limiteMb: 50 }] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.ventanas).toHaveLength(0);
  });

  it('campo inválido: ventana con fecha no "AAAA-MM-DD" → se elimina', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas: [{ desde: '01-01-2024', hasta: '02-02-2024', horaDesde: '09:00', horaHasta: '18:00', limiteMb: 50 }] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.ventanas).toHaveLength(0);
  });

  it('campo inválido: más de 12 ventanas → recorta a 12', () => {
    const ventanas = Array.from({ length: 15 }, (_, i) => {
      const d = i + 1;
      return {
        desde: `2024-01-${String(d).padStart(2, '0')}`,
        hasta: `2024-01-${String(d + 1).padStart(2, '0')}`,
        horaDesde: '09:00',
        horaHasta: '18:00',
        limiteMb: 50,
      };
    });
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.ventanas).toHaveLength(12);
  });

  it('campo inválido: limiteMeshMb no número → sustituye por defecto (null)', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          'mi-cuenta': { mesh: true, limiteMeshMb: 'no-entero' },
          'entidad': { mesh: false, limiteMeshMb: null },
          'publico': { mesh: false, limiteMeshMb: null },
        },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.porAudiencia['mi-cuenta'].limiteMeshMb).toBe(null);
  });

  it('campo inválido: compartirMedidas no boolean → sustituye por defecto (false)', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: 'si',
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.compartirMedidas).toBe(false);
  });

  it('ajustes válidos completos → devuelve tal cual', () => {
    const datos = {
      version: 1,
      compartirConOtros: true,
      banco: { activo: true, modo: 'diario' as const, diarioMb: 250, ventanas: [] },
      porAudiencia: {
        'mi-cuenta': { mesh: true, limiteMeshMb: 100 },
        'entidad': { mesh: false, limiteMeshMb: null },
        'publico': { mesh: true, limiteMeshMb: 50 },
      },
      declaraLimitada: true,
      compartirMedidas: true,
    };
    const almacen = crearAlmacen({ 'starseed.malla.internet.v1': JSON.stringify(datos) });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toEqual(datos);
  });

  it('campo inválido: ventana con limiteMb no número → se elimina', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas: [{ desde: '2024-01-01', hasta: '2024-01-02', horaDesde: '09:00', horaHasta: '18:00', limiteMb: 'no-entero' }] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.ventanas).toHaveLength(0);
  });

  it('campo inválido: ventana con limiteMb negativo → se elimina', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas: [{ desde: '2024-01-01', hasta: '2024-01-02', horaDesde: '09:00', horaHasta: '18:00', limiteMb: -10 }] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.ventanas).toHaveLength(0);
  });

  it('declaraLimitada con valor no boolean (string) → sustituye por defecto (null)', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: 'sí',
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.declaraLimitada).toBe(null);
  });

  it('almacén lanza error en getItem → devuelve defectos', () => {
    const almacen = {
      getItem: () => { throw new Error('error lectura'); },
    } as { getItem: () => string | null };
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toEqual(AJUSTES_APAGADOS);
  });

  it('banco activo con ventana válida → conserva la ventana', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: true, modo: 'programado', diarioMb: 100, ventanas: [{ desde: '2024-01-01', hasta: '2024-01-31', horaDesde: '08:00', horaHasta: '20:00', limiteMb: 50 }] },
        porAudiencia: { 'mi-cuenta': { mesh: false, limiteMeshMb: null }, 'entidad': { mesh: false, limiteMeshMb: null }, 'publico': { mesh: false, limiteMeshMb: null } },
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.banco.activo).toBe(true);
    expect(r.banco.ventanas).toHaveLength(1);
    expect(r.banco.ventanas[0].limiteMb).toBe(50);
  });

  it('porAudiencia vacío → usa defectos', () => {
    const almacen = crearAlmacen({
      'starseed.malla.internet.v1': JSON.stringify({
        version: 1,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {},
        declaraLimitada: null,
        compartirMedidas: false,
      }),
    });
    const r = leerAjustes(almacen, AJUSTES_APAGADOS);
    expect(r.porAudiencia).toEqual({
      'mi-cuenta': { mesh: false, limiteMeshMb: null },
      'entidad': { mesh: false, limiteMeshMb: null },
      'publico': { mesh: false, limiteMeshMb: null },
    });
  });
});

describe('guardarAjustes', () => {
  const crearAlmacen = (valores: Record<string, string> = {}): Almacen => {
    const m: Record<string, string | null> = { ...valores };
    return {
      getItem: (k) => m[k] ?? null,
      setItem: (k, v) => { m[k] = v; },
    };
  };

  it('éxito → devuelve true', () => {
    const store: Record<string, string | null> = {};
    const almacen: Almacen = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
    };
    const ajustes = { ...AJUSTES_APAGADOS, compartirConOtros: true };
    const r = guardarAjustes(almacen, ajustes);
    expect(r).toBe(true);
    expect(JSON.parse(almacen.getItem('starseed.malla.internet.v1')!).version).toBe(1);
  });

  it('almacén lanza excepción → devuelve false', () => {
    const almacen = {
      getItem: () => null,
      setItem: () => { throw new Error('fallo escritura'); },
    } as Almacen;
    const ajustes = { ...AJUSTES_APAGADOS, compartirConOtros: false };
    const r = guardarAjustes(almacen, ajustes);
    expect(r).toBe(false);
  });

  it('almacén devuelve null → devuelve true (sobrescribe)', () => {
    const store: Record<string, string | null> = { 'starseed.malla.internet.v1': '{"version":1}' };
    const almacen: Almacen = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
    };
    expect(almacen.getItem('starseed.malla.internet.v1')).not.toBeNull();
    const r = guardarAjustes(almacen, AJUSTES_APAGADOS);
    expect(r).toBe(true);
  });
});

describe('ida y vuelta', () => {
  it('guardar y leer devuelve los mismos ajustes', () => {
    const almacen: Record<string, string> = {};
    const mockAlmacen: Almacen = {
      getItem: (k) => almacen[k] ?? null,
      setItem: (k, v) => { almacen[k] = v; },
    };

    const originales = { ...AJUSTES_APAGADOS, compartirConOtros: true, compartirMedidas: true, declaraLimitada: false } as const;

    expect(guardarAjustes(mockAlmacen, originales)).toBe(true);
    const leidos = leerAjustes(mockAlmacen, AJUSTES_APAGADOS);
    expect(leidos).toEqual(originales);
  });
});