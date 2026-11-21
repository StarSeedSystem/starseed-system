import { describe, it, expect } from 'vitest';
import { leerContadores, registrarBytes, AUDIENCIAS, contadoresConValor, puedePasarConBanco } from '../almacen-contadores';
import { contadoresVacios, diaLocal, mesLocal, usadoHoyMb } from '../contadores';
import type { Contadores, Audiencia } from '../contadores';

const CLAVE = 'starseed.malla.internet.contadores.v1';

function crearAlmacen(datos: Record<string, string> = {}) {
  const datosInternos = datos;
  return {
    getItem: (clave: string) => datosInternos[clave] ?? null,
    setItem: (clave: string, valor: string) => { datosInternos[clave] = valor; },
  };
}

const ahora = 1700000000000;
const desfaseMin = -new Date().getTimezoneOffset();
const audiencia: Audiencia = 'mi-cuenta';

function contadoresGuardados(): Contadores {
  const c = contadoresVacios(ahora, desfaseMin);
  c.bytesDia['mi-cuenta'] = 500_000_000;
  c.bytesMes['mi-cuenta'] = 2_000_000_000;
  return c;
}

describe('leerContadores', () => {
  it('devuelve contadores vacios cuando no hay dato guardado', () => {
    const almacen = crearAlmacen({});
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBeDefined();
    expect(resultado.mes).toBeDefined();
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
    expect(resultado.bytesMes['mi-cuenta']).toBe(0);
  });

  it('devuelve contadores vacios cuando el JSON esta roto', () => {
    const almacen = crearAlmacen({ [CLAVE]: 'no-es-json' });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
  });

  it('devuelve contadores vacios cuando falta el dia guardado', () => {
    const parcial: Partial<Contadores> = {
      mes: '2023-11',
      bytesMes: { 'mi-cuenta': 100, entidad: 0, publico: 0 },
    };
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(parcial) });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
  });

  it('devuelve contadores vacios cuando esta roto (dia invalido)', () => {
    const roto = {
      dia: 12345,
      mes: '2023-11',
      bytesDia: { 'mi-cuenta': 100, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 100, entidad: 0, publico: 0 },
    };
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(roto) });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
  });

  it('lee y devuelve los contadores guardados correctamente', () => {
    const guardados = contadoresGuardados();
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(guardados) });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBe(guardados.dia);
    expect(resultado.bytesDia['mi-cuenta']).toBe(500_000_000);
    expect(resultado.bytesMes['mi-cuenta']).toBe(2_000_000_000);
  });

  it('si el dia guardado ya paso y esta en el mismo mes, reinicia el dia pero preserva el mes', () => {
    const diaAnterior = diaLocal(ahora - 86400000 * 3, desfaseMin);
    const guardados: Contadores = {
      dia: diaAnterior,
      mes: mesLocal(ahora, desfaseMin),
      bytesDia: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 2_000_000_000, entidad: 0, publico: 0 },
    };
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(guardados) });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBeDefined();
    expect(resultado.mes).toBe(guardados.mes);
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
    expect(resultado.bytesMes['mi-cuenta']).toBe(2_000_000_000);
  });

  it('si el mes también paso, devuelve contadores vacios', () => {
    const mesAnterior = mesLocal(ahora - 60 * 86400000, desfaseMin);
    const diaAnterior = diaLocal(ahora - 60 * 86400000, desfaseMin);
    const guardados: Contadores = {
      dia: diaAnterior,
      mes: mesAnterior,
      bytesDia: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 2_000_000_000, entidad: 0, publico: 0 },
    };
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(guardados) });
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
    expect(resultado.bytesMes['mi-cuenta']).toBe(0);
  });
});

describe('registrarBytes', () => {
  it('lee, suma bytes y guarda, devuelve contadores calculados', () => {
    const almacen = crearAlmacen({});
    const resultado = registrarBytes(almacen, audiencia, 100, ahora, desfaseMin);
    expect(resultado.bytesDia[audiencia]).toBe(100);
    expect(resultado.bytesMes[audiencia]).toBe(100);
  });

  it('sumar bytes persiste entre dos lecturas', () => {
    const almacen = crearAlmacen({});
    const c1 = registrarBytes(almacen, audiencia, 100, ahora, desfaseMin);
    const c2 = registrarBytes(almacen, audiencia, 200, ahora, desfaseMin);
    expect(c2.bytesDia[audiencia]).toBe(300);
    expect(c2.bytesMes[audiencia]).toBe(300);
  });

  it('cambio de dia reinicia dia pero no mes', () => {
    const diaAnterior = diaLocal(ahora - 86400000, desfaseMin);
    const mesGuardado = mesLocal(ahora - 86400000, desfaseMin);
    const ahoraNuevo = ahora + 2 * 86400000;
    const guardados: Contadores = {
      dia: diaAnterior,
      mes: mesGuardado,
      bytesDia: { 'mi-cuenta': 1_000_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 3_000_000_000, entidad: 0, publico: 0 },
    };
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(guardados) });
    const resultado = registrarBytes(almacen, audiencia, 50, ahoraNuevo, desfaseMin);
    expect(resultado.bytesDia[audiencia]).toBe(50);
    expect(resultado.bytesMes[audiencia]).toBe(3_000_000_050);
  });

  it('almacen que lanza error devuelve igualmente lo calculado', () => {
    const almacen = {
      getItem: () => null,
      setItem: () => { throw new Error('fallo'); },
    };
    const resultado = registrarBytes(almacen, audiencia, 100, ahora, desfaseMin);
    expect(resultado.bytesDia[audiencia]).toBe(100);
    expect(resultado.bytesMes[audiencia]).toBe(100);
  });

  it('usa contadores vacios si el almacen devuelve null', () => {
    const almacen = crearAlmacen({});
    const resultado = registrarBytes(almacen, audiencia, 250, ahora, desfaseMin);
    expect(resultado.bytesDia[audiencia]).toBe(250);
  });

  it('audiencia otros suma a todos los audiencias', () => {
    const almacen = crearAlmacen({});
    const resultado = registrarBytes(almacen, 'otros', 100, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(100);
    expect(resultado.bytesDia.entidad).toBe(100);
    expect(resultado.bytesDia.publico).toBe(100);
    expect(resultado.bytesMes['mi-cuenta']).toBe(100);
  });
});

describe('AUDIENCIAS', () => {
  it('exporta los tres tipos de audiencia', () => {
    expect(AUDIENCIAS).toEqual(['mi-cuenta', 'entidad', 'publico']);
  });
});

describe('contadoresConValor', () => {
  it('establece el valor para una audiencia sin afectar otras', () => {
    const c = contadoresVacios(ahora, desfaseMin);
    c.bytesDia['mi-cuenta'] = 500_000_000;
    c.bytesMes['mi-cuenta'] = 2_000_000_000;

    const resultado = contadoresConValor(c, 'entidad', 1_500_000);

    expect(resultado.bytesDia['mi-cuenta']).toBe(500_000_000);
    expect(resultado.bytesDia.entidad).toBe(1_500_000);
    expect(resultado.bytesDia.publico).toBe(0);
    expect(resultado.bytesMes['mi-cuenta']).toBe(2_000_000_000);
    expect(resultado.bytesMes.entidad).toBe(1_500_000);
    expect(resultado.bytesMes.publico).toBe(0);
  });
});

describe('puedePasarConBanco', () => {
  it('permitido=true cuando no se supera la ración', () => {
    const c = contadoresVacios(ahora, desfaseMin);
    const resultado = puedePasarConBanco(c, ahora, desfaseMin, 10, 2_000_000);

    expect(resultado.permitido).toBe(true);
    if (resultado.permitido) {
      expect(resultado.hastaMb).toBe(10);
    }
  });

  it('permitido=false cuando se supera la ración (ración 1 MB, 5 MB usados)', () => {
    const c = contadoresVacios(ahora, desfaseMin);
    c.bytesDia['mi-cuenta'] = 0;
    c.bytesDia.entidad = 0;
    c.bytesDia.publico = 5_000_000;

    const resultado = puedePasarConBanco(c, ahora, desfaseMin, 1, 1_000_000);

    expect(resultado.permitido).toBe(false);
    if (!resultado.permitido) {
      expect(resultado.usadoMb).toBe(5);
      expect(resultado.racionMb).toBe(1);
    }
  });

  it('permitido=true cuando hay espacio disponible', () => {
    const c = contadoresVacios(ahora, desfaseMin);
    c.bytesDia['mi-cuenta'] = 0;
    c.bytesDia.entidad = 0;
    c.bytesDia.publico = 0;

    const resultado = puedePasarConBanco(c, ahora, desfaseMin, 10, 2_000_000);

    expect(resultado.permitido).toBe(true);
    if (resultado.permitido) {
      expect(resultado.hastaMb).toBe(10);
    }
  });

  it('permitido=false para otras cuentas cuando ración agotada', () => {
    const c = contadoresVacios(ahora, desfaseMin);
    c.bytesDia['mi-cuenta'] = 0;
    c.bytesDia.entidad = 1_000_000;
    c.bytesDia.publico = 0;
    const usadoActual = usadoHoyMb(c, 'otros', ahora, desfaseMin);
    expect(usadoActual).toBe(1);

    const resultado = puedePasarConBanco(c, ahora, desfaseMin, 1, 1_000_000);

    expect(resultado.permitido).toBe(false);
  });
});
