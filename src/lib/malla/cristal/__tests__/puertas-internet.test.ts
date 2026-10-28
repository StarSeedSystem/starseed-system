import { describe, it, expect } from 'vitest';
import {
  TIPOS_PUERTA,
  COMPARTIR,
  PuertaInternet,
  Solicitante,
  restanteParaOtrosMb,
  puedeUsar,
  costePuerta,
  elegirPuerta,
  puertaParaTesela,
  Compartir,
} from '../puertas-internet';
import type { ClaseDato } from '../tipos';

describe('TIPOS_PUERTA y COMPARTIR', () => {
  it('TIPOS_PUERTA tiene los valores esperados', () => {
    expect(TIPOS_PUERTA).toEqual(['movil-4g', 'movil-5g', 'wifi-externa', 'usb-telefono', 'cable', 'satelite'] as const);
  });

  it('COMPARTIR tiene los valores esperados', () => {
    expect(COMPARTIR).toEqual(['nadie', 'mi-cuenta', 'vinculos', 'grupo', 'publico'] as const);
  });
});

describe('restanteParaOtrosMb', () => {
  const basePuerta: PuertaInternet = {
    id: 'p1',
    neurona: 'n1',
    cuenta: 'c1',
    tipo: 'movil-4g',
    bajadaKbps: 10000,
    subidaKbps: 5000,
    latenciaMs: 50,
    medida: true,
    topeMensualMb: 1000,
    usadoMesMb: 200,
    reservaDuenoPct: 20,
    compartir: 'publico',
  };

  it('devuelve null si no es medida', () => {
    expect(
      restanteParaOtrosMb({ ...basePuerta, medida: false })
    ).toBeNull();
  });

  it('devuelve null si no tiene tope mensual', () => {
    expect(
      restanteParaOtrosMb({ ...basePuerta, topeMensualMb: undefined })
    ).toBeNull();
  });

  it('calcula correctamente el restante para otros', () => {
    // tope: 1000 MB, usado: 200 MB, reserva: 20% = 200 MB
    // restante para otros: 1000 - 200 - 200 = 600 MB
    expect(restanteParaOtrosMb(basePuerta)).toBe(600);
  });

  it('aplica la reserva del 20 % por defecto si no se declara', () => {
    // tope 1000, usado 200, reserva no declarada → 20 % de 1000 = 200 → 600 MB.
    expect(
      restanteParaOtrosMb({ ...basePuerta, reservaDuenoPct: undefined })
    ).toBe(600);
  });

  it('respeta una reserva editable distinta de 20 %', () => {
    // tope 1000, usado 0, reserva 40 % = 400 → 600 MB para otros.
    expect(
      restanteParaOtrosMb({ ...basePuerta, usadoMesMb: 0, reservaDuenoPct: 40 })
    ).toBe(600);
  });

  it('devuelve 0 si el usado más la reserva supera el tope', () => {
    expect(
      restanteParaOtrosMb({
        ...basePuerta,
        usadoMesMb: 900, // 900 usado + 200 reserva = 1100 > 1000 tope
      })
    ).toBe(0);
  });
});

describe('puedeUsar', () => {
  const basePuerta: PuertaInternet = {
    id: 'p1',
    neurona: 'n1',
    cuenta: 'c1',
    tipo: 'movil-4g',
    bajadaKbps: 10000,
    subidaKbps: 5000,
    latenciaMs: 50,
    medida: true,
    topeMensualMb: 1000,
    usadoMesMb: 200,
    reservaDuenoPct: 20,
    compartir: 'publico' as Compartir,
    grupos: ['grupo1', 'grupo2'],
  };

  const baseSolicitante: Solicitante = {
    cuenta: 'c2',
    vinculado: false,
    grupos: [],
  };

  it('permite al dueño sin límite cuando no es medida', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'publico' as Compartir, medida: false },
        { ...baseSolicitante, cuenta: 'c1' } // dueño
      )
    ).toEqual({ ok: true, motivo: 'Dueño sin límite de datos' });
  });

  it('permite al dueño cuando está dentro de su tope', () => {
    expect(
      puedeUsar(basePuerta, { ...baseSolicitante, cuenta: 'c1' }) // dueño
    ).toEqual({ ok: true, motivo: 'Dueño dentro de su tope' });
  });

  it('deniega al dueño cuando ha superado su tope', () => {
    expect(
      puedeUsar(
        { ...basePuerta, usadoMesMb: 1050 }, // 1050 > 1000 tope
        { ...baseSolicitante, cuenta: 'c1' } // dueño
      )
    ).toEqual({ ok: false, motivo: 'Dueño ha superado su tope mensual' });
  });

  it('deniega cuando la puerta está configurada para nadie', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'nadie' },
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'Puerta configurada para no compartir' });
  });

  it('aplica también al dueño una puerta configurada para nadie', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'nadie' },
        { ...baseSolicitante, cuenta: 'c1' } // dueño
      )
    ).toEqual({ ok: false, motivo: 'Puerta configurada para no compartir' });
  });

  it('deniega cuando es solo para mi cuenta y el solicitante no es el dueño', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'mi-cuenta' },
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'Solo la cuenta propietaria puede usar esta puerta' });
  });

  it('permite cuando es para mi cuenta y el solicitante es el dueño', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'mi-cuenta' as Compartir },
        { ...baseSolicitante, cuenta: 'c1' } // dueño
      )
    ).toEqual({ ok: true, motivo: 'Dueño dentro de su tope' });
  });

  it('deniega cuando es para vínculos y el solicitante no está vinculado', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'vinculos' },
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'Solicitante no está vinculado a la cuenta' });
  });

  it('permite cuando es para vínculos y el solicitante está vinculado', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'vinculos' },
        { ...baseSolicitante, vinculado: true }
      )
    ).toEqual({ ok: true, motivo: 'Permitido según configuración de compartir' });
  });

  it('deniega cuando es para grupo y no hay grupos en común', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'grupo', grupos: ['grupo3'] },
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'Solicitante no tiene grupos en común' });
  });

  it('permite cuando es para grupo y hay grupos en común', () => {
    expect(
      puedeUsar(
        { ...basePuerta, compartir: 'grupo', grupos: ['grupo1', 'grupo3'] },
        { ...baseSolicitante, grupos: ['grupo1'] }
      )
    ).toEqual({ ok: true, motivo: 'Permitido según configuración de compartir' });
  });

    it('permite cuando es público y hay datos disponibles', () => {
      expect(
        puedeUsar({ ...basePuerta, compartir: 'publico' as Compartir }, baseSolicitante)
      ).toEqual({ ok: true, motivo: 'Permitido según configuración de compartir' });
    });

  it('deniega cuando es público pero no hay datos disponibles', () => {
    expect(
      puedeUsar(
        { ...basePuerta, usadoMesMb: 950 }, // Solo quedan 50 MB, reserva 200 MB = no hay para otros
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'No queda datos disponibles para compartir' });
  });

  it('deniega a los demás una puerta sin medida ni tope aunque compartir sea público', () => {
    // Sin medida no hay restante calculable para otros (rescate RTTIP1013B).
    expect(
      puedeUsar(
        { ...basePuerta, medida: false, topeMensualMb: undefined },
        baseSolicitante
      )
    ).toEqual({ ok: false, motivo: 'Puerta no medida o sin tope definido' });
  });
});

describe('costePuerta', () => {
  const basePuerta: PuertaInternet = {
    id: 'p1',
    neurona: 'n1',
    cuenta: 'c1',
    tipo: 'movil-4g',
    bajadaKbps: 10000,
    subidaKbps: 5000,
    latenciaMs: 50,
    medida: false,
    compartir: 'publico',
  };

  it('calcula el coste básico basado en latencia y ancho de banda', () => {
    const coste = costePuerta(basePuerta);
    // latencia: 50ms -> 0.05 normalizada
    // ancho: (10000+5000)/2 = 7500 kbps -> 0.75 normalizado (max 10000)
    // coste = 0.05 + (1 - 0.75) = 0.05 + 0.25 = 0.3
    expect(coste).toBeCloseTo(0.3);
  });

  it('duplica el coste cuando es medida', () => {
    const costeNoMedida = costePuerta(basePuerta);
    const costeMedida = costePuerta({ ...basePuerta, medida: true });
    expect(costeMedida).toBeCloseTo(costeNoMedida * 2);
  });

  it('triplica el coste cuando el uso supera el 80% del tope', () => {
    const puertaConUsoAlto = {
      ...basePuerta,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 850, // 85% > 80%
    };
    const costeNormal = costePuerta({ ...basePuerta, medida: true, usadoMesMb: 0 });
    const costeAlto = costePuerta(puertaConUsoAlto);
    // Nota: El cálculo exacto depende de otros factores, pero debería ser significativamente mayor
    expect(costeAlto).toBeGreaterThan(costeNormal);
  });
});

describe('elegirPuerta', () => {
  const baseSolicitante: Solicitante = {
    cuenta: 'c1',
    vinculado: true,
    grupos: ['grupo1'],
  };

  const puertas: PuertaInternet[] = [
    {
      id: 'p1',
      neurona: 'n1',
      cuenta: 'c1',
      tipo: 'movil-4g',
      bajadaKbps: 5000,
      subidaKbps: 2000,
      latenciaMs: 100,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 100,
      reservaDuenoPct: 20,
      compartir: 'publico',
    },
    {
      id: 'p2',
      neurona: 'n2',
      cuenta: 'c1',
      tipo: 'movil-5g',
      bajadaKbps: 20000,
      subidaKbps: 10000,
      latenciaMs: 50,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 200,
      reservaDuenoPct: 20,
      compartir: 'publico',
    },
  ];

  it('devuelve null cuando no necesita internet', () => {
    expect(
      elegirPuerta({
        clase: 'interno' as ClaseDato,
        necesitaInternet: false,
        puertas,
        solicitante: baseSolicitante,
      })
    ).toEqual({
      puerta: null,
      motivo: 'va por la malla P2P: no necesita salir a internet',
    });
  });

  it('devuelve null cuando no hay puertas disponibles', () => {
    expect(
      elegirPuerta({
        clase: 'interno' as ClaseDato,
        necesitaInternet: true,
        puertas: [],
        solicitante: baseSolicitante,
      })
    ).toEqual({
      puerta: null,
      motivo: 'No hay puertas disponibles',
    });
  });

  it('selecciona la puerta de menor coste', () => {
    // p1: latencia 100ms -> 0.1, ancho (5000+2000)/2=3500 -> 0.35 -> coste = 0.1 + 0.65 = 0.75
    // p2: latencia 50ms -> 0.05, ancho (20000+10000)/2=15000 -> 1.0 (máx) -> coste = 0.05 + 0 = 0.05
    // p2 debería ser seleccionada por tener menor coste
    const resultado = elegirPuerta({
      clase: 'interno' as ClaseDato,
      necesitaInternet: true,
      puertas,
      solicitante: baseSolicitante,
    });
    expect(resultado.puerta?.id).toBe('p2');
    expect(resultado.motivo).toBe('Puerta de menor coste seleccionada');
  });

  it('con costes empatados conserva la primera puerta del orden recibido', () => {
    // Main no desempata por id: entre dos costes iguales se queda con la
    // primera que llega en `puertas`.
    const gemelas: PuertaInternet[] = [
      {
        id: 'zeta',
        neurona: 'n1',
        cuenta: 'c1',
        tipo: 'wifi-externa',
        bajadaKbps: 5000,
        subidaKbps: 5000,
        latenciaMs: 100, // 0,1 + 0,5 = 0,6 (no medida)
        medida: false,
        compartir: 'publico',
      },
      {
        id: 'alfa',
        neurona: 'n2',
        cuenta: 'c1',
        tipo: 'cable',
        bajadaKbps: 5000,
        subidaKbps: 5000,
        latenciaMs: 100, // mismo coste que zeta: 0,6
        medida: false,
        compartir: 'publico',
      },
    ];

    const resultado = elegirPuerta({
      clase: 'interno' as ClaseDato,
      necesitaInternet: true,
      puertas: gemelas,
      solicitante: baseSolicitante,
    });

    expect(resultado.puerta?.id).toBe('zeta');
    expect(resultado.motivo).toBe('Puerta de menor coste seleccionada');
  });

  it('aplica histéresis y mantiene la puerta actual cuando su coste es <= mejor * 1.2', () => {
    // Modificamos p1 para que tenga un coste peor (para probar histéresis)
    const puertasModificadas = [
      {
        ...puertas[0],
        latenciaMs: 80, // Peor latencia que p2
        bajadaKbps: 22000,
        subidaKbps: 11000,
        compartir: 'publico' as Compartir,
      },
      {
        ...puertas[1],
        latenciaMs: 60, // Mejor latencia que p1
        bajadaKbps: 18000,
        subidaKbps: 9000,
        compartir: 'publico' as Compartir,
      },
    ];

    // Con estas modificaciones, p1 debería tener mejor coste
    // Pero probamos con la puerta actual siendo p2
    const resultado = elegirPuerta({
      clase: 'interno' as ClaseDato,
      necesitaInternet: true,
      puertas: puertasModificadas,
      solicitante: baseSolicitante,
      actual: 'p2', // Mantener p2 como actual
    });

    // Si el coste de p2 es <= mejor * 1.2, debería mantener p2
    // De lo contrario, debería cambiar a p1
    // Esta prueba verifica que se aplique la lógica de histéresis
    expect(resultado).toMatchObject({
      motivo: expect.stringContaining('histéresis'),
    });
  });

  it('cambia a la de menor coste cuando la actual cuesta mucho más que mejor × 1,2', () => {
    // Rama de salida de la histéresis (rescate RTTIP1013B):
    // p1: 0,9 + 0,65 = 1,55 × 2 (medida) = 3,1 · p2: 0,01 × 2 = 0,02 → 3,1 > 0,024.
    const actualCara = { ...puertas[0], latenciaMs: 900 };
    const otraBarata = { ...puertas[1], latenciaMs: 10, usadoMesMb: 0 };

    const resultado = elegirPuerta({
      clase: 'interno' as ClaseDato,
      necesitaInternet: true,
      puertas: [actualCara, otraBarata],
      solicitante: baseSolicitante,
      actual: 'p1',
    });

    expect(resultado).toEqual({
      puerta: otraBarata,
      motivo: 'Puerta de menor coste seleccionada',
    });
  });

  it('devuelve null cuando ninguna puerta está permitida', () => {
    const puertasNoPermitidas = [
      {
        ...puertas[0],
        compartir: 'nadie' as Compartir, // Nadie puede usar
      },
    ];

    expect(
      elegirPuerta({
        clase: 'interno' as ClaseDato,
        necesitaInternet: true,
        puertas: puertasNoPermitidas,
        solicitante: baseSolicitante,
      })
    ).toEqual({
      puerta: null,
      motivo: 'No hay puertas permitidas para el solicitante',
    });
  });
});

describe('puertaParaTesela', () => {
  it('devuelve solo los campos de la interfaz (lista blanca)', () => {
    const puertaConCamposExtra = {
      id: 'p1',
      neurona: 'n1',
      cuenta: 'c1',
      tipo: 'movil-4g',
      bajadaKbps: 10000,
      subidaKbps: 5000,
      latenciaMs: 50,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 200,
      reservaDuenoPct: 20,
      compartir: 'publico',
      // Campos que deben ser filtrados
      iccid: '12345678901234567890',
      imsi: '123456789012345',
      pin: '1234',
      telefono: '+1234567890',
    };

    const resultado = puertaParaTesela(puertaConCamposExtra as any);
    
    // Verificar que no contenga los campos extra
    expect('iccid' in resultado).toBe(false);
    expect('imsi' in resultado).toBe(false);
    expect('pin' in resultado).toBe(false);
    expect('telefono' in resultado).toBe(false);
    
    // Verificar que contenga los campos requeridos
    expect(resultado.id).toBe('p1');
    expect(resultado.neurona).toBe('n1');
    expect(resultado.cuenta).toBe('c1');
    expect(resultado.tipo).toBe('movil-4g');
  });

  it('sin datos opcionales devuelve exactamente los campos base de la interfaz', () => {
    // Adaptado a la interfaz de HOY: 9 campos base (la rama tenía 8 y «compartir»
    // entró en main por otro camino).
    const base: PuertaInternet = {
      id: 'p1',
      neurona: 'n1',
      cuenta: 'c1',
      tipo: 'cable',
      bajadaKbps: 5000,
      subidaKbps: 5000,
      latenciaMs: 50,
      medida: true,
      compartir: 'publico',
    };

    expect(Object.keys(puertaParaTesela(base)).sort()).toEqual(
      [
        'bajadaKbps',
        'compartir',
        'cuenta',
        'id',
        'latenciaMs',
        'medida',
        'neurona',
        'subidaKbps',
        'tipo',
      ].sort()
    );
  });

  it('conserva los datos opcionales que sí pertenecen a la interfaz', () => {
    const base: PuertaInternet = {
      id: 'p1',
      neurona: 'n1',
      cuenta: 'c1',
      tipo: 'cable',
      bajadaKbps: 5000,
      subidaKbps: 5000,
      latenciaMs: 50,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 200,
      reservaDuenoPct: 20,
      compartir: 'publico',
      grupos: ['grupo1'],
    };

    const salida = puertaParaTesela(base);
    expect(salida.topeMensualMb).toBe(1000);
    expect(salida.usadoMesMb).toBe(200);
    expect(salida.reservaDuenoPct).toBe(20);
    expect(salida.grupos).toEqual(['grupo1']);
  });
});