
import { describe, it, expect } from 'vitest';
import { elegirOidoMovil, debeReiniciarNavegador } from '../oido-movil';

describe('elegirOidoMovil', () => {
  it('debe elegir nube si está disponible', () => {
    const result = elegirOidoMovil({ nubeDisponible: true, whisperDescargado: false, navegadorSoportado: false });
    expect(result.destino).toBe('nube');
  });

  it('debe elegir whisper-web si no hay nube pero está descargado', () => {
    const result = elegirOidoMovil({ nubeDisponible: false, whisperDescargado: true, navegadorSoportado: false });
    expect(result.destino).toBe('whisper-web');
  });

  it('debe elegir navegador-por-voz si no hay otra opción pero está soportado', () => {
    const result = elegirOidoMovil({ nubeDisponible: false, whisperDescargado: false, navegadorSoportado: true });
    expect(result.destino).toBe('navegador-por-voz');
  });
});

describe('debeReiniciarNavegador', () => {
  it('no debe reiniciar si está en turno', () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 0, enTurno: true })).toBe(false);
  });

  it('no debe reiniciar si hay 2 ciclos en silencio', () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: false })).toBe(false);
  });

  it('debe reiniciar si no está en turno y tiene menos de 2 ciclos en silencio', () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 1, enTurno: false })).toBe(true);
  });
});
