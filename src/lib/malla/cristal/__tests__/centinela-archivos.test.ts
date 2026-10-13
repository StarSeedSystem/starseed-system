import { decidirEntrada } from '../centinela-archivos';
import type { ResultadoAnalisis } from '../centinela';
import type { DecisionResonancia } from '../resonancias';
import { describe, it, expect } from "vitest";

describe('decidirEntrada', () => {
  const analisisLimpio: ResultadoAnalisis = { nivel: 'limpio', motivos: [] };
  const analisisSospechoso: ResultadoAnalisis = { nivel: 'sospechoso', motivos: ['motivo1', 'motivo2'] };
  const analisisPeligroso: ResultadoAnalisis = { nivel: 'peligroso', motivos: ['motivo peligroso'] };

  describe('condiciones de rechazo', () => {
    it('rechaza cuando el análisis indica peligroso', () => {
      const res = decidirEntrada(analisisPeligroso, null);
      expect(res.accion).toBe('rechazar');
      expect(res.texto).toContain('motivo peligroso');
    });

    it('rechaza cuando resonancia indica cuarentena (aunque análisis sea limpio)', () => {
      const res = decidirEntrada(analisisLimpio, { decision: 'cuarentena' });
      expect(res.accion).toBe('rechazar');
      expect(res.texto).toBe('Archivo marcado como peligroso');
    });

    it('rechaza cuando tanto análisis como resonancia indican peligro/cuarentena', () => {
      const res = decidirEntrada(analisisPeligroso, { decision: 'cuarentena' });
      expect(res.accion).toBe('rechazar');
      expect(res.texto).toContain('motivo peligroso');
    });
  });

  describe('condiciones de aviso', () => {
    it('avisa cuando el análisis indica sospechoso', () => {
      const res = decidirEntrada(analisisSospechoso, null);
      expect(res.accion).toBe('avisar');
      expect(res.texto).toBe('motivo1 motivo2');
    });

    it('avisa cuando resonancia indica aviso (aunque análisis sea limpio)', () => {
      const res = decidirEntrada(analisisLimpio, { decision: 'aviso' });
      expect(res.accion).toBe('avisar');
      expect(res.texto).toBe('Archivo marcado como sospechoso');
    });

    it('avisa cuando ambos indican sospechoso/aviso', () => {
      const res = decidirEntrada(analisisSospechoso, { decision: 'aviso' });
      expect(res.accion).toBe('avisar');
      expect(res.texto).toBe('motivo1 motivo2');
    });
  });

  describe('condición de preguntar (aceptar-con-pregunta)', () => {
    it('devuelve aceptar-con-pregunta cuando todo es limpio y sin resonancia', () => {
      const res = decidirEntrada(analisisLimpio, null);
      expect(res.accion).toBe('aceptar-con-pregunta');
      expect(res.texto).toBe('');
    });

    it('devuelve aceptar-con-pregunta cuando análisis limpio y resonancia limpio/sin-datos', () => {
      const res = decidirEntrada(analisisLimpio, { decision: 'limpio' });
      expect(res.accion).toBe('aceptar-con-pregunta');
      expect(res.texto).toBe('');

      const res2 = decidirEntrada(analisisLimpio, { decision: 'sin-datos' });
      expect(res2.accion).toBe('aceptar-con-pregunta');
      expect(res2.texto).toBe('');
    });
  });
});