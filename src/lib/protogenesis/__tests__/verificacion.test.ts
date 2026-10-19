import { describe, it, expect } from 'vitest';
import { verificarPaso, siguienteIntento } from '../verificacion';
import type { Paso, Criterio } from '../encargo';
import type { Resultado, VerificadorInfo } from '../verificacion';

describe('verificacion', () => {
  describe('siguienteIntento', () => {
    it('should return reintentar when intentos < LIMITES.intentos', () => {
      expect(siguienteIntento(0)).toBe('reintentar');
      expect(siguienteIntento(1)).toBe('reintentar');
    });

    it('should return necesita-mano when intentos >= LIMITES.intentos', () => {
      expect(siguienteIntento(2)).toBe('necesita-mano');
      expect(siguienteIntento(3)).toBe('necesita-mano');
    });
  });

  describe('verificarPaso', () => {
    const autorId = 'autor-123';
    const pasoBase: Paso = {
      id: 'paso-1',
      atomo: 'atomo-1',
      titulo: 'Paso de prueba',
      entradas: [],
      salida: { formato: 'png' },
      depende: [],
      criterios: [],
      computo: undefined,
    };

    const resultadoBase: Resultado = {
      formato: 'png',
      duracionS: 5,
      bytes: 1000,
      texto: 'resultado de prueba',
      capas: ['capa1', 'capa2'],
    };

    it('should return false when verifier is the author', () => {
      const quien: VerificadorInfo = { id: 'autor-123', tipo: 'persona' };
      const result = verificarPaso(pasoBase, resultadoBase, quien, autorId);
      expect(result.ok).toBe(false);
      expect(result.fallos).toContain('el autor no puede verificarse a sí mismo');
    });

    // Tests for each criterion
    const makePasoConCriterio = (criterio: Criterio): Paso => ({
      ...pasoBase,
      criterios: [criterio],
    });

    describe('formato criterion', () => {
      it('should pass when format matches (case insensitive and trimmed)', () => {
        const criterio: Criterio = { tipo: 'formato', valor: 'PNG', texto: 'Formato debe ser PNG' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(true);
        expect(result.pendientes).toHaveLength(0);
        expect(result.fallos).toHaveLength(0);
      });

      it('should fail when format does not match', () => {
        const criterio: Criterio = { tipo: 'formato', valor: 'JPG', texto: 'Formato debe ser JPG' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (formato) no satisfeito');
      });
    });

    describe('duracion-max criterion', () => {
      it('should pass when duration is less than or equal to max', () => {
        const criterio: Criterio = { tipo: 'duracion-max', valor: 10, texto: 'Duración máxima 10s' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(true);
      });

      it('should fail when duration exceeds max', () => {
        const criterio: Criterio = { tipo: 'duracion-max', valor: 4, texto: 'Duración máxima 4s' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (duracion-max) no satisfeito');
      });

      it('should fail when duration is undefined', () => {
        const criterio: Criterio = { tipo: 'duracion-max', valor: 10, texto: 'Duración máxima 10s' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoSinDuracion = { ...resultadoBase, duracionS: undefined };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoSinDuracion, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (duracion-max) no satisfeito');
      });
    });

    describe('tamano-max criterion', () => {
      it('should pass when size is less than or equal to max', () => {
        const criterio: Criterio = { tipo: 'tamano-max', valor: 2000, texto: 'Tamaño máximo 2000 bytes' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(true);
      });

      it('should fail when size exceeds max', () => {
        const criterio: Criterio = { tipo: 'tamano-max', valor: 500, texto: 'Tamaño máximo 500 bytes' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (tamano-max) no satisfeito');
      });

      it('should fail when size is undefined', () => {
        const criterio: Criterio = { tipo: 'tamano-max', valor: 1000, texto: 'Tamaño máximo 1000 bytes' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoSinBytes = { ...resultadoBase, bytes: undefined };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoSinBytes, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (tamano-max) no satisfeito');
      });
    });

    describe('sin-secretos criterion', () => {
      it('should pass when no secrets are present', () => {
        const criterio: Criterio = { tipo: 'sin-secretos', valor: undefined, texto: 'No debe contener secretos' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(true);
      });

      it('should fail when API key is present in formato', () => {
        const criterio: Criterio = { tipo: 'sin-secretos', valor: undefined, texto: 'No debe contener secretos' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoConSk = { ...resultadoBase, formato: 'sk-abc123' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoConSk, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (sin-secretos) no satisfeito');
      });

      it('should fail when Bearer token is present in texto', () => {
        const criterio: Criterio = { tipo: 'sin-secretos', valor: undefined, texto: 'No debe contener secretos' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoConBearer = { ...resultadoBase, texto: 'Token Bearer xyz' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoConBearer, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (sin-secretos) no satisfeito');
      });

      it('should fail when absolute path is present in capas', () => {
        const criterio: Criterio = { tipo: 'sin-secretos', valor: undefined, texto: 'No debe contener secretos' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoConRuta = { ...resultadoBase, capas: ['/Users/user/file.txt'] };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoConRuta, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (sin-secretos) no satisfeito');
      });
    });

    describe('capas-presentes criterion', () => {
      it('should pass when all required layers are present', () => {
        const criterio: Criterio = { tipo: 'capas-presentes', valor: 'capa1,capa2', texto: 'Capas requeridas: capa1, capa2' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(true);
      });

      it('should fail when a required layer is missing', () => {
        const criterio: Criterio = { tipo: 'capas-presentes', valor: 'capa1,capa3', texto: 'Capas requeridas: capa1, capa3' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (capas-presentes) no satisfeito');
      });

      it('should fail when capas is undefined', () => {
        const criterio: Criterio = { tipo: 'capas-presentes', valor: 'capa1', texto: 'Capa requerida: capa1' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const resultadoSinCapas = { ...resultadoBase, capas: undefined };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoSinCapas, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 0 (capas-presentes) no satisfeito');
      });
    });

    describe('persona criterion', () => {
      it('should be pending when manuales is not provided or false', () => {
        const criterio: Criterio = { tipo: 'persona', valor: undefined, texto: 'Requiere verificación manual' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        // Without manuales
        let result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId);
        expect(result.ok).toBe(false);
        expect(result.pendientes).toContain('criterio 0 (persona) awaiting manual verification');
        expect(result.fallos).toHaveLength(0);

        // With manuales set to false
        result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId, { 0: false });
        expect(result.ok).toBe(false);
        expect(result.pendientes).toContain('criterio 0 (persona) awaiting manual verification');
        expect(result.fallos).toHaveLength(0);
      });

      it('should pass when manuales is true', () => {
        const criterio: Criterio = { tipo: 'persona', valor: undefined, texto: 'Requiere verificación manual' };
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(makePasoConCriterio(criterio), resultadoBase, quien, autorId, { 0: true });
        expect(result.ok).toBe(true);
        expect(result.pendientes).toHaveLength(0);
        expect(result.fallos).toHaveLength(0);
      });
    });

    // Test multiple criteria
    describe('multiple criteria', () => {
      it('should pass when all criteria are satisfied', () => {
        const criterios: Criterio[] = [
          { tipo: 'formato', valor: 'PNG', texto: 'Formato PNG' },
          { tipo: 'duracion-max', valor: 10, texto: 'Duración max 10s' },
          { tipo: 'tamano-max', valor: 2000, texto: 'Tamaño max 2000 bytes' },
          { tipo: 'sin-secretos', valor: undefined, texto: 'No secretos' },
          { tipo: 'capas-presentes', valor: 'capa1,capa2', texto: 'Capas capa1 y capa2' },
          { tipo: 'persona', valor: undefined, texto: 'Verificación manual' },
        ];
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(
          { ...pasoBase, criterios },
          resultadoBase,
          quien,
          autorId,
          { 5: true } // index 5 for persona criterion
        );
        expect(result.ok).toBe(true);
      });

      it('should fail when any criterion fails', () => {
        const criterios: Criterio[] = [
          { tipo: 'formato', valor: 'PNG', texto: 'Formato PNG' },
          { tipo: 'duracion-max', valor: 4, texto: 'Duración max 4s' }, // will fail
        ];
        const quien: VerificadorInfo = { id: 'verificador-1', tipo: 'persona' };
        const result = verificarPaso(
          { ...pasoBase, criterios },
          resultadoBase,
          quien,
          autorId
        );
        expect(result.ok).toBe(false);
        expect(result.fallos).toContain('criterio 1 (duracion-max) no satisfeito');
      });
    });
  });
});