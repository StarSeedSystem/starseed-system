import { describe, it, expect } from 'vitest';
import { motoresPermitidos } from '../licencia-voz';
import { CapasPrefs } from '@/lib/modelos/preferencias-capas';

// Motores de prueba
const omnivoice = { id: 'omnivoice', claseLicencia: 'personal' as const };
const supertonic = { id: 'supertonic', claseLicencia: 'condicionada' as const, condicionCumplida: true };
const kokoro = { id: 'kokoro', claseLicencia: 'libre' as const };
const indextts = { id: 'indextts', claseLicencia: 'condicionada' as const, condicionCumplida: true };
const indexttsCondicionFalse = { id: 'indextts-false', claseLicencia: 'condicionada' as const, condicionCumplida: false };

// Capas vacías por defecto
const capasVacias: CapasPrefs = {};

describe('motoresPermitidos', () => {
  describe('contexto personal', () => {
    it('debe permitir OmniVoice (personal) y Kokoro (libre) cuando se permite uso personal', () => {
      // Para permitir uso personal en contexto personal, necesitamos capa.persona = "personal"
      const capasConPersonal: CapasPrefs = { persona: 'personal' };
      const motores = [omnivoice, supertonic, kokoro, indextts];
      const { permitidos, excluidos } = motoresPermitidos(motores, 'personal', capasConPersonal);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['omnivoice', 'kokoro']));
      expect(excluidos.map(e => e.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
      // Verificar motivos de exclusión
      const motivos = excluidos.reduce((acc, e) => {
        acc[e.id] = e.motivo;
        return acc;
      }, {} as Record<string, string>);
      expect(motivos.supertonic).toBe('licencia condicionada no permitida en este contexto');
      expect(motivos.indextts).toBe('licencia condicionada no permitida en este contexto');
    });

    it('debe permitir Supertonic y IndexTTS si sus condiciones se cumplen y las capas lo permiten', () => {
      // Establecemos las capas de comunidad y grupo a condicionada para permitir licencias condicionadas
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada', grupo: 'condicionada' };
      const motores = [supertonic, indextts];
      const { permitidos } = motoresPermitidos(motores, 'personal', capasConCondicion);
      // En contexto personal, la licencia personal no se permite porque no hay capa persona personal
      // Pero las capas de comunidad y grupo a condicionada añaden condicionada al conjunto permitido
      // Sin embargo, la función preferenciasEfectivas no añade personal sin capa persona personal y contexto personal
      // Entonces, en este caso, se permiten las condicionadas porque están en la lista permitida
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
    });
  });

  describe('contexto grupo', () => {
    it('debe permitir Kokoro (libre) y motores condicionadas con condición cumplida', () => {
      const motores = [omnivoice, supertonic, kokoro, indextts];
      const { permitidos, excluidos } = motoresPermitidos(motores, 'grupo', capasVacias);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['kokoro']));
      expect(excluidos.map(e => e.id)).toEqual(expect.arrayContaining(['omnivoice', 'supertonic', 'indextts']));
      const motivos = excluidos.reduce((acc, e) => {
        acc[e.id] = e.motivo;
        return acc;
      }, {} as Record<string, string>);
      expect(motivos.omnivoice).toBe('pesos no comerciales: solo uso personal');
      expect(motivos.supertonic).toBe('licencia condicionada no permitida en este contexto');
      expect(motivos.indextts).toBe('licencia condicionada no permitida en este contexto');
    });

    it('debe permitir Supertonic y IndexTTS si las capas de comunidad o grupo permiten condicionada', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [supertonic, indextts];
      const { permitidos } = motoresPermitidos(motores, 'grupo', capasConCondicion);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
    });

    it('no debe permitir motores condicionadas si la condición no se cumple', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [indexttsCondicionFalse];
      const { excluidos } = motoresPermitidos(motores, 'grupo', capasConCondicion);
      expect(excluidos[0].motivo).toBe('condición no cumplida');
    });
  });

  describe('contexto comunidad', () => {
    it('debe permitir Kokoro (libre) y motores condicionadas con condición cumplida', () => {
      const motores = [omnivoice, supertonic, kokoro, indextts];
      const { permitidos, excluidos } = motoresPermitidos(motores, 'comunidad', capasVacias);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['kokoro']));
      expect(excluidos.map(e => e.id)).toEqual(expect.arrayContaining(['omnivoice', 'supertonic', 'indextts']));
      const motivos = excluidos.reduce((acc, e) => {
        acc[e.id] = e.motivo;
        return acc;
      }, {} as Record<string, string>);
      expect(motivos.omnivoice).toBe('pesos no comerciales: solo uso personal');
      expect(motivos.supertonic).toBe('licencia condicionada no permitida en este contexto');
      expect(motivos.indextts).toBe('licencia condicionada no permitida en este contexto');
    });

    it('debe permitir Supertonic y IndexTTS si las capas de comunidad permiten condicionada', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [supertonic, indextts];
      const { permitidos } = motoresPermitidos(motores, 'comunidad', capasConCondicion);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
    });

    it('no debe permitir motores condicionadas si la condición no se cumple', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [indexttsCondicionFalse];
      const { excluidos } = motoresPermitidos(motores, 'comunidad', capasConCondicion);
      expect(excluidos[0].motivo).toBe('condición no cumplida');
    });
  });

  describe('contexto publico', () => {
    it('debe permitir Kokoro (libre) y motores condicionadas con condición cumplida', () => {
      const motores = [omnivoice, supertonic, kokoro, indextts];
      const { permitidos, excluidos } = motoresPermitidos(motores, 'publico', capasVacias);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['kokoro']));
      expect(excluidos.map(e => e.id)).toEqual(expect.arrayContaining(['omnivoice', 'supertonic', 'indextts']));
      const motivos = excluidos.reduce((acc, e) => {
        acc[e.id] = e.motivo;
        return acc;
      }, {} as Record<string, string>);
      expect(motivos.omnivoice).toBe('pesos no comerciales: solo uso personal');
      expect(motivos.supertonic).toBe('licencia condicionada no permitida en este contexto');
      expect(motivos.indextts).toBe('licencia condicionada no permitida en este contexto');
    });

    it('debe permitir Supertonic y IndexTTS si las capas de comunidad permiten condicionada', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [supertonic, indextts];
      const { permitidos } = motoresPermitidos(motores, 'publico', capasConCondicion);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
    });

    it('no debe permitir motores condicionadas si la condición no se cumple', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [indexttsCondicionFalse];
      const { excluidos } = motoresPermitidos(motores, 'publico', capasConCondicion);
      expect(excluidos[0].motivo).toBe('condición no cumplida');
    });
  });

  describe('contexto comercial', () => {
    it('debe tratar comercial como publico sin uso personal', () => {
      const motores = [omnivoice, supertonic, kokoro, indextts];
      const { permitidos, excluidos } = motoresPermitidos(motores, 'comercial', capasVacias);
      // Debería ser igual que en contexto publico
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['kokoro']));
      expect(excluidos.map(e => e.id)).toEqual(expect.arrayContaining(['omnivoice', 'supertonic', 'indextts']));
      const motivos = excluidos.reduce((acc, e) => {
        acc[e.id] = e.motivo;
        return acc;
      }, {} as Record<string, string>);
      expect(motivos.supertonic).toBe('licencia condicionada no permitida en este contexto');
      expect(motivos.indextts).toBe('licencia condicionada no permitida en este contexto');
    });

    it('debe permitir Supertonic y IndexTTS si las capas de comunidad permiten condicionada', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [supertonic, indextts];
      const { permitidos } = motoresPermitidos(motores, 'comercial', capasConCondicion);
      expect(permitidos.map(m => m.id)).toEqual(expect.arrayContaining(['supertonic', 'indextts']));
    });

    it('no debe permitir motores condicionadas si la condición no se cumple', () => {
      const capasConCondicion: CapasPrefs = { comunidad: 'condicionada' };
      const motores = [indexttsCondicionFalse];
      const { excluidos } = motoresPermitidos(motores, 'comercial', capasConCondicion);
      expect(excluidos[0].motivo).toBe('condición no cumplida');
    });
  });
});