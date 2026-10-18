import { describe, it, expect } from 'vitest';
import {
  crearSesion,
  TipoAlcance,
  Alcance,
  Sesion,
  permitido,
  revocar,
  avisoAnfitrion,
} from '../sesion-prestamo';
describe('sesion-prestamo', () => {
  const ahora = 1000;
  const duracionMs = 5000;
  const anfitrion = 'anfitrion-1';
  const invitado = 'invitado-1';
  const alcance: Alcance = { tipo: 'app', id: 'app-1' };

  describe('crearSesion', () => {
    it('should create session with injected id and correct values', () => {
      const sesion = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'fixed-id'
      );
      expect(sesion).toEqual({
        id: 'fixed-id',
        anfitrion,
        invitado,
        alcance,
        inicio: ahora,
        vence: ahora + duracionMs,
        revocada: false,
      });
    });

    it('should generate different ids by default', () => {
      const sesion1 = crearSesion({ anfitrion, invitado, alcance, duracionMs, ahora });
      const sesion2 = crearSesion({ anfitrion, invitado, alcance, duracionMs, ahora });
      expect(sesion1.id).not.toBe(sesion2.id);
    });
  });
  describe('permitido', () => {
    it('returns true for valid session', () => {
      const sesion = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'fixed-id'
      );
      expect(permitido(sesion, 'any-action', ahora + 1000)).toBe(true);
    });

    it('returns false for expired session', () => {
      const sesion = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'fixed-id'
      );
      expect(permitido(sesion, 'any-action', ahora + duracionMs + 1000)).toBe(false);
    });

    it('returns false for revoked session', () => {
      const sesion = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'fixed-id'
      );
      expect(permitido(revocar(sesion), 'any-action', ahora)).toBe(false);
    });
  });
  describe('revocar', () => {
    it('returns session with revocada true', () => {
      const sesion = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'fixed-id'
      );
      const revocada = revocar(sesion);
      expect(revocada.revocada).toBe(true);
      expect(revocada).toEqual({ ...sesion, revocada: true });
    });
  });
  describe('avisoAnfitrion', () => {
    it('returns active sessions for host', () => {
      const sesion1 = crearSesion(
        { anfitrion, invitado, alcance, duracionMs, ahora },
        () => 'id1'
      );
      const sesion2 = crearSesion(
        { anfitrion, invitado: 'invitado-2', alcance: { tipo: 'capacidad', id: 'cap-1' }, duracionMs, ahora },
        () => 'id2'
      );
      const sesionRevoca = revocar(
        crearSesion(
          { anfitrion, invitado: 'invitado-3', alcance: { tipo: 'volumen', id: 'vol-1' }, duracionMs, ahora },
          () => 'id3'
        )
      );
      const sesionExpirada = crearSesion(
        { anfitrion, invitado: 'invitado-4', alcance: { tipo: 'app', id: 'app-2' }, duracionMs: 1000, ahora: ahora - 2000 },
        () => 'id4'
      );

      const sesiones = [sesion1, sesion2, sesionRevoca, sesionExpirada];
      const tiempoAhora = ahora + 1000;
      const avisos = avisoAnfitrion(sesiones, tiempoAhora);

      expect(avisos).toHaveLength(2);
      expect(avisos[0]).toEqual({
        invitado: 'invitado-1',
        recursoTipo: 'app',
        recursoId: 'app-1',
        inicio: ahora,
        duracionTranscurrida: 1000,
      });
      expect(avisos[1]).toEqual({
        invitado: 'invitado-2',
        recursoTipo: 'capacidad',
        recursoId: 'cap-1',
        inicio: ahora,
        duracionTranscurrida: 1000,
      });
    });
  });
});