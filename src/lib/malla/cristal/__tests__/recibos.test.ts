// Pruebas del recibo único: monotonía por tipo y cada adaptador.

import { describe, it, expect } from "vitest";
import { aplicar, orden, reciboInicial } from "../recibos";
import type { Recibo } from "../recibos";
import {
  desdeEntregaMesh,
  desdeAcuseUniversal,
  desdeArchivo,
  desdeFaseLlamada,
} from "../adaptadores-recibos";

function base(tipo: Recibo['tipo']): Recibo {
  return reciboInicial('d1', tipo, 1000);
}

describe('orden y monotonía', () => {
  it('mensaje/archivo: preparado < enviado < recibido < leido', () => {
    expect(orden('mensaje', 'preparado')).toBe(0);
    expect(orden('mensaje', 'leido')).toBe(3);
    expect(orden('archivo', 'recibido')).toBe(2);
  });

  it('publicacion: preparado < enviado < publicado < propagado', () => {
    expect(orden('publicacion', 'publicado')).toBe(2);
    expect(orden('publicacion', 'propagado')).toBe(3);
  });

  it('llamada: llamando < en-directo < terminada', () => {
    expect(orden('llamada', 'llamando')).toBe(0);
    expect(orden('llamada', 'terminada')).toBe(2);
  });

  it('un estado anterior se ignora', () => {
    let r = base('mensaje');
    r = aplicar(r, { estado: 'recibido', t: 1100 });
    const igual = aplicar(r, { estado: 'enviado', t: 1200 });
    expect(igual).toBe(r);
    expect(igual.estado).toBe('recibido');
  });

  it('un estado posterior avanza y conserva campos', () => {
    let r = aplicar(base('publicacion'), { estado: 'enviado', medio: 'webrtc' });
    r = aplicar(r, { estado: 'publicado', confirmadoPor: 'feed', t: 2000 });
    expect(r.estado).toBe('publicado');
    expect(r.medio).toBe('webrtc');
    expect(r.confirmadoPor).toBe('feed');
    expect(r.t).toBe(2000);
  });

  it('un estado de otra cadena no aplica (recibido en llamada)', () => {
    const r = base('llamada');
    expect(aplicar(r, { estado: 'recibido' })).toBe(r);
  });

  it('fallido entra antes del recibo y ya no después', () => {
    let r = base('mensaje');
    r = aplicar(r, { estado: 'fallido', detalle: 'sin ruta' });
    expect(r.estado).toBe('fallido');
    r = aplicar(r, { estado: 'enviado' }); // la cadena sigue pudiendo avanzar
    r = aplicar(r, { estado: 'recibido' });
    expect(aplicar(r, { estado: 'fallido' })).toBe(r);
  });

  it('fallido no pisa publicado ni en-directo', () => {
    const pub = aplicar(base('publicacion'), { estado: 'publicado' });
    expect(aplicar(pub, { estado: 'fallido' })).toBe(pub);
    const lla = aplicar(base('llamada'), { estado: 'en-directo' });
    expect(aplicar(lla, { estado: 'fallido' })).toBe(lla);
  });
});

describe('adaptadores', () => {
  it('desdeEntregaMesh traduce cada estado total y el medio por la vía', () => {
    const hops = [{ via: 'webrtc', status: 'confirmed' }, { via: 'lora', status: 'skipped' }];
    expect(desdeEntregaMesh({ status: 'delivered', hops }).estado).toBe('recibido');
    expect(desdeEntregaMesh({ status: 'sent', hops }).estado).toBe('enviado');
    expect(desdeEntregaMesh({ status: 'partial', hops }).estado).toBe('enviado');
    expect(desdeEntregaMesh({ status: 'queued', hops }).estado).toBe('preparado');
    expect(desdeEntregaMesh({ status: 'failed', hops }).estado).toBe('fallido');
    const ev = desdeEntregaMesh({ status: 'delivered', hops });
    expect(ev.medio).toBe('webrtc');
    expect(ev.ruta).toEqual(['webrtc', 'lora']);
  });

  it('desdeEntregaMesh con vía desconocida da medio null', () => {
    const ev = desdeEntregaMesh({ status: 'sent', hops: [{ via: 'humo', status: 'sent' }] });
    expect(ev.medio).toBeNull();
  });

  it('desdeAcuseUniversal: confirmado es recibido, si no enviado', () => {
    const ok = desdeAcuseUniversal({ enlace: 'ble', confirmado: true });
    expect(ok.estado).toBe('recibido');
    expect(ok.medio).toBe('ble');
    expect(ok.confirmadoPor).toBe('ble');
    const no = desdeAcuseUniversal({ enlace: 'wifi-lan', confirmado: false });
    expect(no.estado).toBe('enviado');
  });

  it('desdeArchivo: ok es recibido, error es fallido', () => {
    expect(desdeArchivo({ evento: 'archivo.ok' }).estado).toBe('recibido');
    const mal = desdeArchivo({ evento: 'archivo.error' });
    expect(mal.estado).toBe('fallido');
    expect(mal.detalle).toContain('falló');
  });

  it('desdeFaseLlamada cubre las cuatro fases', () => {
    expect(desdeFaseLlamada('llamando').estado).toBe('llamando');
    expect(desdeFaseLlamada('entrante').estado).toBe('llamando');
    expect(desdeFaseLlamada('en-curso').estado).toBe('en-directo');
    expect(desdeFaseLlamada('terminada').estado).toBe('terminada');
  });

  it('flujo completo llamada con adaptador', () => {
    let r = base('llamada');
    r = aplicar(r, desdeFaseLlamada('en-curso'));
    r = aplicar(r, desdeFaseLlamada('llamando'));
    expect(r.estado).toBe('en-directo');
    r = aplicar(r, desdeFaseLlamada('terminada'));
    expect(r.estado).toBe('terminada');
  });
});
