import { describe, it, expect } from 'vitest';
import { decidirCompartir } from '../decision-compartir';
import { PuertaInternet, Compartir } from '../../cristal/puertas-internet';
import { Audiencia, AjustesInternet } from '../tipos';
import { Contadores } from '../contadores';
import { ajustesPorDefecto } from '../defectos-audiencia';
import { contadoresVacios } from '../contadores';

const ahora = Date.now();
const desfaseMin = 0;

const crearPuerta = (overrides: Partial<PuertaInternet> = {}): PuertaInternet => ({
  id: 'puerta-1',
  neurona: 'neurona-1',
  cuenta: 'cuenta-1',
  tipo: 'movil-4g',
  bajadaKbps: 10000,
  subidaKbps: 5000,
  latenciaMs: 50,
  medida: true,
  topeMensualMb: 1000,
  usadoMesMb: 200,
  reservaDuenoPct: 20,
  compartir: 'publico' as Compartir,
  ...overrides,
});

const ajustesBase = ajustesPorDefecto();

const contadoresBase = contadoresVacios(ahora, desfaseMin);

describe('decidirCompartir', () => {
  describe('Regla 1: mi-cuenta', () => {
    it('cuenta propia sin límite con "otros" apagado → permitido, hastaMb null', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: null },
        },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: true,
        hastaMb: null,
        motivo: 'sin límite',
      });
    });

    it('cuenta propia con limiteMeshMb numérico y "otros" apagado → permitido con ese límite', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: 500 },
        },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: true,
        hastaMb: 500,
        motivo: 'límite: 500 MB',
      });
    });

    it('cuenta propia con banco activo → límite del banco no se aplica a mi-cuenta', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        banco: { activo: true, modo: 'diario', diarioMb: 300, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: null },
        },
      };
      const contadores = { ...contadoresBase, bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 100 * 1_000_000 } };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('sin límite');
    });
  });

  describe('Regla 2: entidad y público - compartirConOtros apagado', () => {
    it('entidad con interruptor apagado → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          entidad: { mesh: true, limiteMeshMb: null },
        },
      };

      const resultado = decidirCompartir({
        audiencia: 'entidad',
        ajustes,
        contadores: contadoresBase,
        puerta: crearPuerta(),
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: false,
        hastaMb: null,
        motivo: 'el dueño no ha encendido compartir con otros',
      });
    });

    it('público con interruptor apagado → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta: crearPuerta(),
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: false,
        hastaMb: null,
        motivo: 'el dueño no ha encendido compartir con otros',
      });
    });
  });

  describe('Regla 3: mesh apagado para la audiencia', () => {
    it('entidad con mesh=false → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          entidad: { mesh: false, limiteMeshMb: null },
        },
      };

      const resultado = decidirCompartir({
        audiencia: 'entidad',
        ajustes,
        contadores: contadoresBase,
        puerta: crearPuerta(),
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: false,
        hastaMb: null,
        motivo: expect.stringContaining('malla'),
      });
    });

    it('público con mesh=false → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: false, limiteMeshMb: null },
        },
      };

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta: crearPuerta(),
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: false,
        hastaMb: null,
        motivo: expect.stringContaining('malla'),
      });
    });
  });

  describe('Regla 4: la puerta manda (puedeUsar + restanteParaOtrosMb)', () => {
    it('puerta con compartir=nadie → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      const puerta = crearPuerta({ compartir: 'nadie', medida: true, topeMensualMb: 1000, usadoMesMb: 100 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('compartir');
    });

    it('puerta sin medida ni tope → null para otros (sin límite calculable)', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      const puerta = crearPuerta({ medida: false, topeMensualMb: undefined });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('no medida');
    });

    it('reserva de la puerta (20% por defecto) limita el máximo para otros', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // tope 1000, usado 200, reserva 20% = 200 → restante para otros = 600
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 200, reservaDuenoPct: 20 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(600);
      expect(resultado.motivo).toContain('puerta');
    });

    it('reserva personalizada (40%) se respeta', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // tope 1000, usado 0, reserva 40% = 400 → restante = 600
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 0, reservaDuenoPct: 40 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.hastaMb).toBe(600);
    });

    it('tope mensual agotado (usado + reserva >= tope) → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // tope 1000, usado 900, reserva 20% = 200 → 1100 > 1000 → 0 disponible
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 900, reservaDuenoPct: 20 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.hastaMb).toBe(0);
      expect(resultado.motivo).toContain('puerta');
    });
  });

  describe('Regla 5: modo banco activo con cupoBanco', () => {
    it('público con banco agotado → no permitido', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: true, modo: 'diario', diarioMb: 100, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // 100 MB ya usados por "otros"
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 100 * 1_000_000 },
      };
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 100 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.hastaMb).toBe(0);
      expect(resultado.motivo).toContain('banco');
    });

    it('público con banco con saldo → mínimo entre banco y puerta', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: true, modo: 'diario', diarioMb: 500, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // 100 MB usados por "otros", banco diario 500 → 400 MB restantes en banco
      // Puerta: tope 1000, usado 200, reserva 20% = 200 → 600 MB para otros
      // Mínimo = 400 (banco)
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 100 * 1_000_000 },
      };
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 200 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(400);
      expect(resultado.motivo).toContain('banco');
    });

    it('banco en modo programado con ventana vigente → aplica límite de la ventana', () => {
      const hoy = new Date(ahora + desfaseMin * 60000).toISOString().split('T')[0];
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: {
          activo: true,
          modo: 'programado',
          diarioMb: 0,
          ventanas: [
            { desde: hoy, hasta: hoy, horaDesde: '00:00', horaHasta: '23:59', limiteMb: 250 },
          ],
        },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 50 * 1_000_000 },
      };
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 100 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(200); // ventana 250 - 50 usados = 200
      expect(resultado.motivo).toContain('banco');
    });

    it('banco programado fuera de ventana → no permitido', () => {
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: {
          activo: true,
          modo: 'programado',
          diarioMb: 0,
          ventanas: [
            { desde: ayer, hasta: ayer, horaDesde: '00:00', horaHasta: '23:59', limiteMb: 250 },
          ],
        },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      const puerta = crearPuerta();

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain('banco');
    });
  });

  describe('Regla 6: hastaMb = mínimo de los límites que apliquen', () => {
    it('límite de audiencia (limiteMeshMb) + puerta + banco → mínimo de los tres', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: true, modo: 'diario', diarioMb: 300, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: 400 },
        },
      };
      // Audiencia: 400 MB
      // Banco: 300 - 50 usados = 250 MB
      // Puerta: tope 1000, usado 200, reserva 20% = 200 → 600 MB
      // Mínimo = 250 (banco)
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 50 * 1_000_000 },
      };
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 200 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(250);
    });

    it('sin ninguna regla limitante → hastaMb null', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: null },
        },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('sin límite');
    });

    it('solo límite de audiencia numérico → hastaMb = límite de audiencia', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: 200 },
        },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(200);
    });

    it('solo límite de puerta → hastaMb = límite de puerta', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // Puerta: tope 500, usado 100, reserva 20% = 100 → 300 MB para otros
      const puerta = crearPuerta({ topeMensualMb: 500, usadoMesMb: 100, reservaDuenoPct: 20 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(300);
    });
  });

  describe('Pruebas manuales verificadas', () => {
    it('compartirConOtros: false, audiencia mi-cuenta, limiteMeshMb: 200 → permitido true, hastaMb 200', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: 200 },
        },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado).toEqual({
        permitido: true,
        hastaMb: 200,
        motivo: 'límite: 200 MB',
      });
    });

    it('banco.activo true, bytesDia.otros definido → usadoHoyMb calcula correctamente', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: true, modo: 'diario', diarioMb: 500, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          publico: { mesh: true, limiteMeshMb: null },
        },
      };
      // bytesDia: mi-cuenta=0, entidad=0, publico=150 MB → total otros = 150 MB
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 150 * 1_000_000 },
      };
      const puerta = crearPuerta({ topeMensualMb: 1000, usadoMesMb: 100 });

      const resultado = decidirCompartir({
        audiencia: 'publico',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      // Banco: 500 - 150 = 350 MB
      // Puerta: 1000 - 100 - 200 = 700 MB
      // Mínimo = 350 MB (banco)
      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBe(350);
      expect(resultado.motivo).toContain('banco');
    });

    it('mi-cuenta con banco activo → límite del banco no se aplica a mi-cuenta', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: false,
        banco: { activo: true, modo: 'diario', diarioMb: 300, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: null },
        },
      };
      const contadores = {
        ...contadoresBase,
        bytesDia: { 'mi-cuenta': 0, entidad: 50 * 1_000_000, publico: 50 * 1_000_000 },
      };
      const puerta = crearPuerta({ medida: false });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('sin límite');
    });

    it('minimoNoNull devuelve null cuando todos los valores son null', () => {
      const ajustes: AjustesInternet = {
        ...ajustesBase,
        compartirConOtros: true,
        banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
        porAudiencia: {
          ...ajustesBase.porAudiencia,
          'mi-cuenta': { mesh: true, limiteMeshMb: null },
        },
      };
      // Puerta sin medida ni tope → mi-cuenta como dueño puede usar sin límite
      const puerta = crearPuerta({ medida: false, topeMensualMb: undefined });

      const resultado = decidirCompartir({
        audiencia: 'mi-cuenta',
        ajustes,
        contadores: contadoresBase,
        puerta,
        ahora,
        desfaseMin,
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.hastaMb).toBeNull();
      expect(resultado.motivo).toContain('sin límite');
    });
  });
});