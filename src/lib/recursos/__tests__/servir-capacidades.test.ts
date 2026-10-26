import { describe, it, expect } from 'vitest';
import { crearServidor, MAX_COLA_CAPACIDAD } from '../servir-capacidades';
import { crearSesion, type Sesion } from '../sesion-prestamo';
import type { OfertaNeurona } from '../oferta';
import type { Msg, TipoCapacidad } from '../../network/capacidad-por-malla';

const ofertaBase = (): OfertaNeurona => ({
  nodoId: 'n1',
  cuentaId: 'c1',
  medio: 'web',
  computo: { nucleos: 1, ramLibreMb: 8000, gpu: false, motores: ['palabra'] },
  almacen: { prestaMb: 0, volumenes: [] },
  apps: [],
  enlaces: {},
  energia: { enUso: false },
  presta: {
    cuenta: true,
    grupos: [],
    publico: false,
    topes: { cpuPct: 100, ramMb: 4000, discoMb: 0, soloCargando: false },
  },
  t: 1000,
});

const sesionDe = (id: string, invitado: string): Sesion =>
  crearSesion(
    { anfitrion: 'n1', invitado, alcance: { tipo: 'capacidad', id: 'palabra' }, duracionMs: 60000, ahora: 1000 },
    () => id,
  );

const pedir = (id: string, sesionId?: string, tipo: TipoCapacidad = 'palabra') => ({
  t: 'capacidad.pedir' as const,
  id,
  tipo,
  cuerpo: {},
  sesionId,
});

const cancelar = (id: string) => ({ t: 'capacidad.cancelar' as const, id });

type Diferida = { promesa: Promise<unknown>; resolver: (v: unknown) => void };
const defer = (): Diferida => {
  let resolver!: (v: unknown) => void;
  const promesa = new Promise((res) => { resolver = res; });
  return { promesa, resolver };
};

const esError = (msg: Msg | undefined, estado: number): boolean =>
  !!msg && msg.t === 'capacidad.error' && msg.estado === estado;
const mensajeDe = (msg: Msg | undefined): string =>
  msg && msg.t === 'capacidad.error' ? msg.mensaje : '';

describe('servir-capacidades', () => {
  const configBase = { oferta: ofertaBase(), sesiones: [sesionDe('s1', 'i1')], ahora: () => 1000 };

  it('atiende con sesión válida, trocea la respuesta y registra el préstamo hecho', async () => {
    const servidor = crearServidor({ ...configBase, manejadores: { palabra: () => ({ obras: 3 }) } });
    const salida = await servidor.atender(pedir('p1', 's1'));
    const json = JSON.stringify({ obras: 3 });
    expect(salida).toHaveLength(2);
    expect(salida[0]).toEqual({ t: 'capacidad.trozo', id: 'p1', texto: json });
    expect(salida[1]).toEqual({ t: 'capacidad.fin', id: 'p1', resultado: { obras: 3 } });
    const { vivos, hechos } = servidor.prestamos();
    expect(vivos).toHaveLength(0);
    expect(hechos).toHaveLength(1);
    expect(hechos[0]).toEqual({ id: 'p1', tipo: 'palabra', invitado: 'i1', duracionMs: 0, bytes: json.length, fin: 'fin' });
  });

  it('rechaza sin sesión (403) y con la sesión vencida (403)', async () => {
    let t = 1000;
    const servidor = crearServidor({ ...configBase, manejadores: { palabra: () => 'ok' }, ahora: () => t });
    expect((await servidor.atender(pedir('p1')))[0] ?? null).toEqual({
      t: 'capacidad.error',
      id: 'p1',
      estado: 403,
      mensaje: 'Sin sesión de préstamo válida para usar esta capacidad.',
    });
    t = 61000; // pasada la duración de la sesión (60000 ms)
    expect(esError((await servidor.atender(pedir('p2', 's1')))[0], 403)).toBe(true);
  });

  it('no sirve una capacidad sin manejador y queda en 404', async () => {
    const servidor = crearServidor({ ...configBase, manejadores: {} });
    const salida = await servidor.atender(pedir('p1', 's1'));
    expect(esError(salida[0], 404)).toBe(true);
  });

  it('respeta los topes de capacidadPrestable: sin cómputo prestable ni motor con 503', async () => {
    const agotada = ofertaBase();
    agotada.presta.topes.soloCargando = true;
    agotada.energia.cargando = false;
    const servidorAgotada = crearServidor({ ...configBase, oferta: agotada, manejadores: { palabra: () => 'a' } });
    expect(esError((await servidorAgotada.atender(pedir('p1', 's1')))[0], 503)).toBe(true);
    const servidor = crearServidor({
      ...configBase,
      manejadores: { palabra: () => 'a', render: () => 'b' },
    });
    const salidaMotor = await servidor.atender(pedir('p2', 's1', 'render'));
    expect(esError(salidaMotor[0], 503)).toBe(true);
    expect(mensajeDe(salidaMotor[0])).toContain('no presta el motor «render»');
  });

  it('encola cuando está completo (máx. 4), desborda con 503 e ignora ids repetidos', async () => {
    const d1 = defer();
    const servidor = crearServidor({ ...configBase, manejadores: { palabra: () => d1.promesa } });
    void servidor.atender(pedir('p1', 's1')); // vivo, suspendido en el manejador
    expect(servidor.prestamos().vivos).toHaveLength(1);
    expect(await servidor.atender(pedir('p1', 's1'))).toEqual([]); // id repetido
    for (let i = 2; i <= MAX_COLA_CAPACIDAD + 1; i++) {
      expect(await servidor.atender(pedir(`p${i}`, 's1'))).toEqual([]); // encoladas
    }
    const desbordada = await servidor.atender(pedir('p999', 's1'));
    expect(esError(desbordada[0], 503)).toBe(true);
    expect(mensajeDe(desbordada[0])).toContain('llena');
  });

  it('cancela un préstamo vivo y corre la cola, avisando por alResponder', async () => {
    const d1 = defer();
    const d2 = defer();
    let llamadas = 0;
    const respuestas: Msg[][] = [];
    const servidor = crearServidor({
      ...configBase,
      manejadores: { palabra: () => (llamadas++ === 0 ? d1.promesa : d2.promesa) },
      alResponder: (msgs) => respuestas.push(msgs),
    });
    void servidor.atender(pedir('p1', 's1')); // vivo, suspendido
    expect(await servidor.atender(pedir('p2', 's1'))).toEqual([]); // encolada
    expect(await servidor.atender(cancelar('p1'))).toEqual([]);
    const cancelado = servidor.prestamos().hechos.find((h) => h.fin === 'cancelado');
    expect(cancelado?.id).toBe('p1');
    expect(cancelado?.invitado).toBe('i1');
    d1.resolver({ tarde: true }); // su resultado ya no sale: se canceló
    d2.resolver({ obras: 7 }); // la cabeza de la cola corre al drenar
    await new Promise((r) => setTimeout(r, 0));
    expect(respuestas.flat().some((m) => m.t === 'capacidad.fin' && m.id === 'p2')).toBe(true);
    expect(respuestas.flat().some((m) => m.t === 'capacidad.fin' && m.id === 'p1')).toBe(false);
  });

  it('cancela una petición encolada, que entonces nunca corre, y trocea respuestas grandes', async () => {
    const d1 = defer();
    let llamadas = 0;
    const servidor = crearServidor({
      ...configBase,
      manejadores: { palabra: () => (llamadas++ === 0 ? d1.promesa : 'a'.repeat(40000)) },
    });
    expect(await servidor.atender(cancelar('no-existe'))).toEqual([]);
    void servidor.atender(pedir('p1', 's1'));
    expect(await servidor.atender(pedir('p2', 's1'))).toEqual([]); // encolada
    expect(await servidor.atender(cancelar('p2'))).toEqual([]);
    d1.resolver({ ok: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(servidor.prestamos().hechos.some((h) => h.id === 'p2')).toBe(false);
    const salida = await servidor.atender(pedir('p3', 's1'));
    const json = JSON.stringify('a'.repeat(40000));
    const trozos = salida.filter((m) => m.t === 'capacidad.trozo');
    expect(trozos.map((m) => (m.t === 'capacidad.trozo' ? m.texto : '')).join('')).toBe(json);
    expect(salida[salida.length - 1]?.t).toBe('capacidad.fin');
  });

  it('un manejador que falla da 500 y anota el hecho con bytes 0', async () => {
    const servidor = crearServidor({
      ...configBase,
      manejadores: {
        palabra: () => {
          throw new Error('se rompió');
        },
      },
    });
    const salida = await servidor.atender(pedir('p1', 's1'));
    expect(esError(salida[0], 500)).toBe(true);
    expect(mensajeDe(salida[0])).toContain('se rompió');
    const hecho = servidor.prestamos().hechos[0];
    expect(hecho?.fin).toBe('error');
    expect(hecho?.bytes).toBe(0);
  });
});
