import { describe, it, expect } from 'vitest';
import { sugerirComparticion } from '../auto-compartir';
import { PuertaInternet, Compartir } from '../cristal/puertas-internet';

const crearPuerta = (overrides: Partial<PuertaInternet> = {}): PuertaInternet => ({
  id: 'puerta-1',
  neurona: 'neurona-1',
  cuenta: 'cuenta-1',
  tipo: 'movil-4g',
  bajadaKbps: 10000,
  subidaKbps: 5000,
  latenciaMs: 50,
  medida: false,
  topeMensualMb: undefined,
  usadoMesMb: undefined,
  reservaDuenoPct: 20,
  compartir: 'vinculos',
  grupos: ['grupo-1'],
  ...overrides,
});

const preferenciasBase = {
  compartirMaximo: 'vinculos' as Compartir,
  soloWifi: true,
  kbpsSubidaMax: 10000,
  permitirMedida: false,
  reservaBateriaMinPct: 30,
};

const estadoBase = {
  enWifi: true,
  cargando: false,
  bateriaPct: 80,
  medida: false,
  usoMb: 0,
};

const ahora = Date.now();
const desfaseMin = 0;

describe('sugerirComparticion', () => {
  it('interruptor apagado (compartir=nadie) → nunca ofrece', () => {
    const puerta = crearPuerta({ compartir: 'nadie' });
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones).toHaveLength(1);
    expect(decisiones[0]).toMatchObject({
      puertaId: 'puerta-1',
      con: 'nadie',
      accion: 'retirar',
    });
    expect(decisiones[0].motivo).toContain('Interruptor de compartir apagado');
  });

  it('interruptor apagado (compartir undefined) → nunca ofrece', () => {
    const puerta = crearPuerta({ compartir: undefined as any });
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('Interruptor de compartir apagado');
  });

  it('en datos móviles con soloWifi=true → retira', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const estado = { ...estadoBase, enWifi: false };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('solo Wi-Fi');
  });

  it('en Wi-Fi con soloWifi=true → ofrece', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const estado = { ...estadoBase, enWifi: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('batería baja (20%) sin cargar y reserva 30% → retira', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const estado = { ...estadoBase, bateriaPct: 20, cargando: false };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('Batería al 20%');
  });

  it('batería baja (20%) pero cargando → ofrece', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const estado = { ...estadoBase, bateriaPct: 20, cargando: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('batería null (desconocida) → se da por suficiente y ofrece', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const estado = { ...estadoBase, bateriaPct: null };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('nivel pedido por encima del máximo → baja al máximo', () => {
    const puerta = crearPuerta({ compartir: 'publico' });
    const preferencias = { ...preferenciasBase, compartirMaximo: 'vinculos' as Compartir };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].con).toBe('vinculos');
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('nivel pedido igual al máximo → mantiene nivel', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const preferencias = { ...preferenciasBase, compartirMaximo: 'vinculos' as Compartir };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].con).toBe('vinculos');
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('nivel pedido por debajo del máximo → mantiene nivel de la puerta', () => {
    const puerta = crearPuerta({ compartir: 'mi-cuenta' });
    const preferencias = { ...preferenciasBase, compartirMaximo: 'publico' as Compartir };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].con).toBe('mi-cuenta');
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('subida supera kbpsSubidaMax → retira', () => {
    const puerta = crearPuerta({ compartir: 'vinculos', subidaKbps: 15000 });
    const preferencias = { ...preferenciasBase, kbpsSubidaMax: 10000 };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('supera tope');
  });

  it('subida igual a kbpsSubidaMax → ofrece', () => {
    const puerta = crearPuerta({ compartir: 'vinculos', subidaKbps: 10000 });
    const preferencias = { ...preferenciasBase, kbpsSubidaMax: 10000 };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('conexión medida sin permiso (permitirMedida=false) → retira', () => {
    const puerta = crearPuerta({ compartir: 'vinculos', medida: true });
    const preferencias = { ...preferenciasBase, permitirMedida: false };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('medidos');
  });

  it('conexión medida con permiso (permitirMedida=true) → ofrece', () => {
    const puerta = crearPuerta({ compartir: 'vinculos', medida: true, topeMensualMb: 1000, usadoMesMb: 100 });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('tope mensual medido superado (con reserva dueño) → retira', () => {
    const puerta = crearPuerta({
      compartir: 'vinculos',
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 900,
      reservaDuenoPct: 20,
    });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('Tope mensual');
  });

  it('tope mensual medido con espacio para otros → ofrece', () => {
    const puerta = crearPuerta({
      compartir: 'vinculos',
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 500,
      reservaDuenoPct: 20,
    });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('estado.medida=true y uso actual supera tope → retira', () => {
    const puerta = crearPuerta({
      compartir: 'vinculos',
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 100,
      reservaDuenoPct: 20,
    });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    const estado = { ...estadoBase, medida: true, usoMb: 900 };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('Uso actual');
  });

  it('todo permitido → ofrece con motivo completo', () => {
    const puerta = crearPuerta({ compartir: 'vinculos' });
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias: preferenciasBase,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
    expect(decisiones[0].motivo).toContain('Cumple todas las condiciones');
  });

  it('múltiples puertas: cada una evaluada independientemente', () => {
    const puertas = [
      crearPuerta({ id: 'puerta-wifi', tipo: 'wifi-externa', compartir: 'vinculos', medida: false }),
      crearPuerta({ id: 'puerta-movil', tipo: 'movil-4g', compartir: 'grupo', medida: true, topeMensualMb: 500, usadoMesMb: 100 }),
      crearPuerta({ id: 'puerta-apagada', tipo: 'cable', compartir: 'nadie' }),
    ];
    const preferencias = { ...preferenciasBase, permitirMedida: true, compartirMaximo: 'grupo' as Compartir };
    const { decisiones } = sugerirComparticion({
      puertas,
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones).toHaveLength(3);
    expect(decisiones.find(d => d.puertaId === 'puerta-wifi')?.accion).toBe('ofrecer');
    expect(decisiones.find(d => d.puertaId === 'puerta-movil')?.accion).toBe('ofrecer');
    expect(decisiones.find(d => d.puertaId === 'puerta-apagada')?.accion).toBe('retirar');
  });

  it('puerta sin topeMensualMb pero medida=true → no retira por tope (null = sin límite)', () => {
    const puerta = crearPuerta({ compartir: 'vinculos', medida: true, topeMensualMb: undefined });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('reservaDuenoPct personalizada (50%) se respeta en cálculo de tope', () => {
    const puerta = crearPuerta({
      compartir: 'vinculos',
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 400,
      reservaDuenoPct: 50,
    });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    // 1000 - 400 - 500 = 100 disponible para otros → ofrece
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('ofrecer');
  });

  it('reservaDuenoPct 50% con uso 600 → no hay espacio para otros → retira', () => {
    const puerta = crearPuerta({
      compartir: 'vinculos',
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 600,
      reservaDuenoPct: 50,
    });
    const preferencias = { ...preferenciasBase, permitirMedida: true };
    // 1000 - 600 - 500 = -100 → 0 disponible para otros → retira
    const { decisiones } = sugerirComparticion({
      puertas: [puerta],
      preferencias,
      estado: estadoBase,
      ahora,
      desfaseMin,
    });
    expect(decisiones[0].accion).toBe('retirar');
    expect(decisiones[0].motivo).toContain('Tope mensual');
  });
});