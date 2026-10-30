import { describe, it, expect } from 'vitest';
import { siguienteEstadoOrbe, parametrosVisuales } from '../estado-orbe';

import type { EstadoOrbe } from '../estado-orbe';
const inicio: EstadoOrbe = { fase: 'reposo', capa: null, nivelVoz: 0, texto: '' };

describe('siguienteEstadoOrbe', () => {
  it('reposo → escuchando', () => {
    const s = siguienteEstadoOrbe(inicio, { tipo: 'escucha-inicio' });
    expect(s.fase).toBe('escuchando');
  });
  it('escuchando → pensando → hablando → reposo', () => {
    let s = siguienteEstadoOrbe(inicio, { tipo: 'escucha-inicio' });
    s = siguienteEstadoOrbe(s, { tipo: 'entendido', capa: 'reflejo' });
    expect(s.fase).toBe('pensando');
    expect(s.capa).toBe('reflejo');
    s = siguienteEstadoOrbe(s, { tipo: 'habla-inicio' });
    expect(s.fase).toBe('hablando');
    s = siguienteEstadoOrbe(s, { tipo: 'habla-fin' });
    expect(s.fase).toBe('reposo');
  });
  it('error vuelve a reposo con texto', () => {
    const s = siguienteEstadoOrbe({ fase: 'hablando', capa: 'razon', nivelVoz: 0.5, texto: 'x' }, { tipo: 'error', texto: 'Falló' });
    expect(s.fase).toBe('reposo');
    expect(s.capa).toBeNull();
    expect(s.texto).toBe('Falló');
  });
  it('capa razon para creación libre', () => {
    const s = siguienteEstadoOrbe(inicio, { tipo: 'entendido', capa: 'razon' });
    expect(s.capa).toBe('razon');
  });
  it('capa reflejo para orden cerrada', () => {
    const s = siguienteEstadoOrbe(inicio, { tipo: 'entendido', capa: 'reflejo' });
    expect(s.capa).toBe('reflejo');
  });
  it('texto parcial se sustituye y se conserva el final', () => {
    let s = siguienteEstadoOrbe(inicio, { tipo: 'texto-parcial', texto: 'Hola' });
    expect(s.texto).toBe('Hola');
    s = siguienteEstadoOrbe(s, { tipo: 'texto-parcial', texto: 'Hola mundo' });
    expect(s.texto).toBe('Hola mundo');
  });
  it('escucha-fin vuelve a reposo', () => {
    let s = siguienteEstadoOrbe(inicio, { tipo: 'escucha-inicio' });
    s = siguienteEstadoOrbe(s, { tipo: 'escucha-fin' });
    expect(s.fase).toBe('reposo');
  });
});

describe('parametrosVisuales', () => {
  it('con movimiento reducido pulso es 0', () => {
    const e: EstadoOrbe = { fase: 'escuchando', capa: null, nivelVoz: 0.7, texto: '' };
    const p = parametrosVisuales(e, true);
    expect(p.pulso).toBe(0);
  });
  it('color zenith vivo cuando no está en reposo', () => {
    const e: EstadoOrbe = { fase: 'hablando', capa: null, nivelVoz: 0, texto: '' };
    const p = parametrosVisuales(e, false);
    expect(p.color).toBe('#007FFF');
  });
});
