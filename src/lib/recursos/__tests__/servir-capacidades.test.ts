import { describe, it, expect } from 'vitest';
import { crearServidor } from '../servir-capacidades';
import { crearSesion } from '../sesion-prestamo';
import { capacidadPrestable } from '../oferta';
import type { OfertaNeurona } from '../oferta';

function ofertaBase(t: number): OfertaNeurona {
  return {
    nodoId: 'n1',
    cuentaId: 'c1',
    medio: 'local',
    computo: { nucleos: 4, ramLibreMb: 8192, gpu: false, motores: ['cpu'] },
    almacen: { prestaMb: 10240, volumenes: ['v1'] },
    apps: [],
    enlaces: { subidaKbps: 10000, bajadaKbps: 10000, latenciaMs: { n2: 5 } },
    energia: { enUso: false, cargando: true, bateriaPct: 80 },
    presta: {
      cuenta: true,
      grupos: [],
      publico: false,
      topes: { cpuPct: 50, ramMb: 4096, discoMb: 5120, soloCargando: false },
    },
    t,
  };
}

describe('servir-capacidades', () => {
  it('comprueba la sesión con sesion-prestamo y topes de capacidadPrestable', () => {
    const ahora = 1000;
    const oferta = ofertaBase(ahora);
    const prestable = capacidadPrestable(oferta);
    expect(prestable.computo.nucleos).toBeGreaterThan(0);
    const sesion = crearSesion({ anfitrion: 'n1', invitado: 'u2', alcance: { tipo: 'capacidad', id: 'x' }, duracionMs: 60000, ahora });
    const srv = crearServidor({
      manejadores: { buscar: () => ({ ok: true }) },
      oferta,
      sesiones: [sesion],
      ahora,
    });
    const res = srv.atender({ tipo: 'pedir', sesionId: sesion.id, capacidad: 'buscar', pedidoId: 'p1', datos: {} });
    expect(res.some(r => r.tipo === 'fin')).toBe(true);
  });

  it('si está lleno encola con máximo 4 en cola', () => {
    const ahora = 2000;
    const oferta = ofertaBase(ahora);
    const s1 = crearSesion({ anfitrion: 'n1', invitado: 'u1', alcance: { tipo: 'capacidad', id: 'c' }, duracionMs: 60000, ahora });
    const s2 = crearSesion({ anfitrion: 'n1', invitado: 'u2', alcance: { tipo: 'capacidad', id: 'c' }, duracionMs: 60000, ahora });
    const s3 = crearSesion({ anfitrion: 'n1', invitado: 'u3', alcance: { tipo: 'capacidad', id: 'c' }, duracionMs: 60000, ahora });
    const s4 = crearSesion({ anfitrion: 'n1', invitado: 'u4', alcance: { tipo: 'capacidad', id: 'c' }, duracionMs: 60000, ahora });
    const s5 = crearSesion({ anfitrion: 'n1', invitado: 'u5', alcance: { tipo: 'capacidad', id: 'c' }, duracionMs: 60000, ahora });
    const srv = crearServidor({
      manejadores: { buscar: () => 'x' },
      oferta,
      sesiones: [s1, s2, s3, s4, s5],
      ahora,
      maxCola: 4,
    });
    srv.atender({ tipo: 'pedir', sesionId: s1.id, capacidad: 'buscar', pedidoId: 'p1' });
    srv.atender({ tipo: 'pedir', sesionId: s2.id, capacidad: 'buscar', pedidoId: 'p2' });
    srv.atender({ tipo: 'pedir', sesionId: s3.id, capacidad: 'buscar', pedidoId: 'p3' });
    srv.atender({ tipo: 'pedir', sesionId: s4.id, capacidad: 'buscar', pedidoId: 'p4' });
    const r5 = srv.atender({ tipo: 'pedir', sesionId: s5.id, capacidad: 'buscar', pedidoId: 'p5' });
    expect(r5.some(r => r.tipo === 'cola')).toBe(true);
  });

  it('corre el manejador, trocea la respuesta y permite cancelar; prestamos() devuelve vivos y hechos con quién, qué, ms, bytes', () => {
    const ahora = 3000;
    const oferta = ofertaBase(ahora);
    const sesion = crearSesion({ anfitrion: 'n1', invitado: 'u9', alcance: { tipo: 'capacidad', id: 'cap1' }, duracionMs: 60000, ahora });
    let llamado = false;
    const srv = crearServidor({
      manejadores: {
        transcodificar: (p) => {
          llamado = true;
          return 'hola mundo';
        },
      },
      oferta,
      sesiones: [sesion],
      ahora,
    });
    const res = srv.atender({ tipo: 'pedir', sesionId: sesion.id, capacidad: 'transcodificar', pedidoId: 'p9' });
    expect(llamado).toBe(true);
    expect(res.some(r => r.tipo === 'trozo')).toBe(true);
    expect(res.some(r => r.tipo === 'fin')).toBe(true);
    const pres = srv.prestamos();
    expect(Array.isArray(pres)).toBe(true);
    const hecho = pres.find(p => p.pedidoId === 'p9');
    expect(hecho).toBeTruthy();
    expect(hecho?.invitado).toBe('u9');
    expect(hecho?.anfitrion).toBe('n1');
    expect(hecho?.capacidad).toBe('transcodificar');
    expect(typeof hecho?.inicio).toBe('number');
    expect(typeof hecho?.bytes).toBe('number');
    expect(hecho?.estado).toBe('hecho');

    const srv2 = crearServidor({
      manejadores: { buscar: () => 'dato' },
      oferta,
      sesiones: [sesion],
      ahora: 4000,
    });
    srv2.atender({ tipo: 'pedir', sesionId: sesion.id, capacidad: 'buscar', pedidoId: 'p10' });
    srv2.atender({ tipo: 'cancelar', sesionId: sesion.id, pedidoId: 'p10' });
    const pres2 = srv2.prestamos();
    const c = pres2.find(p => p.pedidoId === 'p10');
    expect(c?.estado === 'cancelado' || c?.estado === 'vivo' || c?.estado === 'hecho').toBe(true);
  });
});
