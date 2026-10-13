import { describe, it, expect } from 'vitest';
import { decidirEntrada, AnalisisEntrada } from '../centinela-archivos';
import type { DecisionResonancia, ResultadoResonancia } from '../resonancias';

describe('decidirEntrada', () => {
  describe('Peligroso o cuarentena → rechazar', () => {
    it('rechaza cuando el análisis es peligroso', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'peligroso',
        motivos: ['Ejecutable DOS (MZ) detectado por bytes mágicos']
      };
      const resonancia: ResultadoResonancia | null = null;
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('rechazar');
      expect(resultado.texto).toContain('Archivo rechazado por seguridad.');
      expect(resultado.texto).toContain('Ejecutable DOS (MZ) detectado por bytes mágicos');
    });

    it('rechaza cuando la resonancia es cuarentena', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'limpio',
        motivos: []
      };
      const resonancia: ResultadoResonancia = {
        decision: 'cuarentena',
        cuentas: 2,
        motivo: '2 cuentas marcan peligroso'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('rechazar');
      expect(resultado.texto).toContain('Archivo rechazado por seguridad.');
      expect(resultado.texto).toContain('2 cuentas marcan peligroso');
    });

    it('rechaza cuando tanto análisis como resonancia indican peligro', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'peligroso',
        motivos: ['Extensión peligrosa: .exe']
      };
      const resonancia: ResultadoResonancia = {
        decision: 'cuarentena',
        cuentas: 3,
        motivo: '3 cuentas marcan peligroso'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('rechazar');
      expect(resultado.texto).toContain('Archivo rechazado por seguridad.');
      expect(resultado.texto).toContain('Extensión peligrosa: .exe');
      expect(resultado.texto).toContain('3 cuentas marcan peligroso');
    });
  });

  describe('Sospechoso o aviso → avisar con los motivos', () => {
    it('avisa cuando el análisis es sospechoso', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'sospechoso',
        motivos: ['Shebang (#!) detectado al inicio del archivo']
      };
      const resonancia: ResultadoResonancia | null = null;
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('avisar');
      expect(resultado.texto).toContain('Precaución:');
      expect(resultado.texto).toContain('Shebang (#!) detectado al inicio del archivo');
    });

    it('avisa cuando la resonancia es aviso', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'limpio',
        motivos: []
      };
      const resonancia: ResultadoResonancia = {
        decision: 'aviso',
        cuentas: 1,
        motivo: 'una cuenta marca peligroso'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('avisar');
      expect(resultado.texto).toContain('Precaución:');
      expect(resultado.texto).toContain('una cuenta marca peligroso');
    });

    it('avisa cuando tanto análisis como resonancia indican sospecha', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'sospechoso',
        motivos: ['Tipo real (PNG) no coincide con la extensión (.txt) o tipo declarado (text/plain)']
      };
      const resonancia: ResultadoResonancia = {
        decision: 'aviso',
        cuentas: 2,
        motivo: '2 cuentas marcan sospechoso'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('avisar');
      expect(resultado.texto).toContain('Precaución:');
      expect(resultado.texto).toContain('Tipo real (PNG) no coincide con la extensión (.txt) o tipo declarado (text/plain)');
      expect(resultado.texto).toContain('2 cuentas marcan sospechoso');
    });
  });

  describe('Si no, preguntar', () => {
    it('devuelve aceptar-con-pregunta cuando todo es limpio', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'limpio',
        motivos: []
      };
      const resonancia: ResultadoResonancia | null = {
        decision: 'limpio',
        cuentas: 2,
        motivo: '2 cuentas marcan limpio'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('aceptar-con-pregunta');
      expect(resultado.texto).toBe('¿Aceptar este archivo?');
    });

    it('devuelve aceptar-con-pregunta cuando no hay resonancia', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'limpio',
        motivos: []
      };
      const resonancia: ResultadoResonancia | null = null;
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('aceptar-con-pregunta');
      expect(resultado.texto).toBe('¿Aceptar este archivo?');
    });

    it('devuelve aceptar-con-pregunta cuando análisis es limpio y resonancia es sin-datos', () => {
      const analisis: AnalisisEntrada = {
        nivel: 'limpio',
        motivos: []
      };
      const resonancia: ResultadoResonancia = {
        decision: 'sin-datos',
        cuentas: 0,
        motivo: 'pocos veredictos fiables'
      };
      
      const resultado = decidirEntrada(analisis, resonancia);
      
      expect(resultado.accion).toBe('aceptar-con-pregunta');
      expect(resultado.texto).toBe('¿Aceptar este archivo?');
    });
  });
});