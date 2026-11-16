import { describe, it, expect } from 'vitest';
import { clasificarConexion } from '../conexion-limitada';

describe('clasificarConexion', () => {
  describe('declarada (prioridad máxima)', () => {
    it('declarada=true → limitada, fuente "declarada"', () => {
      const r = clasificarConexion({ declarada: true });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('declarada');
      expect(r.motivo).toBe('La persona declaró que es conexión limitada');
    });

    it('declarada=false → no-limitada, fuente "declarada"', () => {
      const r = clasificarConexion({ declarada: false });
      expect(r.estado).toBe('no-limitada');
      expect(r.fuente).toBe('declarada');
      expect(r.motivo).toBe('La persona declaró que la conexión no es limitada');
    });
  });

  describe('nativaMedida (segunda prioridad)', () => {
    it('nativaMedida=true → limitada, fuente "nativa"', () => {
      const r = clasificarConexion({ nativaMedida: true });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('nativa');
      expect(r.motivo).toBe('La marca de red indica conexión limitada');
    });

    it('nativaMedida=false → no-limitada, fuente "nativa"', () => {
      const r = clasificarConexion({ nativaMedida: false });
      expect(r.estado).toBe('no-limitada');
      expect(r.fuente).toBe('nativa');
      expect(r.motivo).toBe('La marca de red indica conexión no limitada');
    });
  });

  describe('navegador (tercera prioridad)', () => {
    it('tipo="cellular" → limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ tipo: 'cellular' });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('saveData=true → limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ saveData: true });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('effectiveType="slow-2g" → limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ effectiveType: 'slow-2g' });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('effectiveType="2g" → limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ effectiveType: '2g' });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('tipo="wifi" sin saveData → no-limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ tipo: 'wifi' });
      expect(r.estado).toBe('no-limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('tipo="ethernet" → no-limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ tipo: 'ethernet' });
      expect(r.estado).toBe('no-limitada');
      expect(r.fuente).toBe('navegador');
    });

    it('tipo="wifi" con saveData=true → limitada, fuente "navegador"', () => {
      const r = clasificarConexion({ tipo: 'wifi', saveData: true });
      expect(r.estado).toBe('limitada');
      expect(r.fuente).toBe('navegador');
    });
  });

  describe('ausencia de señal', () => {
    it('sin datos → desconocida, fuente "ninguna"', () => {
      const r = clasificarConexion({});
      expect(r.estado).toBe('desconocida');
      expect(r.fuente).toBe('ninguna');
      expect(r.motivo).toBe('No hay señal suficiente para determinar si la conexión es limitada');
    });

    it('sin datos incluso con null explícito → desconocida, fuente "ninguna"', () => {
      const r = clasificarConexion({ declarada: null, nativaMedida: null, tipo: undefined, saveData: undefined, effectiveType: undefined });
      expect(r.estado).toBe('desconocida');
      expect(r.fuente).toBe('ninguna');
    });
  });

  describe('valores raros / bordes', () => {
    it('tipo desconocido no lanza, vuelve a desconocida', () => {
      const r = clasificarConexion({ tipo: 'desconocido' });
      expect(r.estado).toBe('desconocida');
    });

    it('effectiveType con valor no estándar no lanza', () => {
      const r = clasificarConexion({ effectiveType: '3g' });
      expect(r.estado).toBe('desconocida');
    });

    it('solo effectiveType con valor no estándar → desconocida', () => {
      const r = clasificarConexion({ effectiveType: '4g' });
      expect(r.estado).toBe('desconocida');
    });
  });

  describe('jerarquía de prioridad', () => {
    it('declarada gana a nativaMedida gana a navegador', () => {
      const r1 = clasificarConexion({ declarada: true, nativaMedida: false, tipo: 'cellular' });
      expect(r1.estado).toBe('limitada');
      expect(r1.fuente).toBe('declarada');

      const r2 = clasificarConexion({ declarada: null, nativaMedida: true, tipo: 'wifi' });
      expect(r2.estado).toBe('limitada');
      expect(r2.fuente).toBe('nativa');

      const r3 = clasificarConexion({ declarada: null, nativaMedida: null, tipo: 'wifi' });
      expect(r3.estado).toBe('no-limitada');
      expect(r3.fuente).toBe('navegador');
    });
  });
});