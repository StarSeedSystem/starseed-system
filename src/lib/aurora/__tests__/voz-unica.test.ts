import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearVozUnica, type OpcionesHablar, type Motores, type VozRT } from '../voz-unica';

describe('voz-unica', () => {
  let motores: Motores;
  let vozUnica: ReturnType<typeof crearVozUnica>;
  let disponibleCallCount = 0;

  beforeEach(() => {
    disponibleCallCount = 0;
    // Mock the motors
    motores = {
      vozRT: {
        disponible: vi.fn().mockImplementation(() => {
          disponibleCallCount++;
          return disponibleCallCount <= 2;
        }),
        decirRT: vi.fn(),
      },
      speakWithConfiguredEngine: vi.fn(),
      callarVozRT: vi.fn(),
      callarCola: vi.fn(),
      callarMezclador: vi.fn(),
      callarMotorLocal: vi.fn(),
    };

    vozUnica = crearVozUnica(motores);
  });

  afterEach(() => {
    vi.clearAllMocks();
    disponibleCallCount = 0;
  });

  describe('hablar', () => {
    it('should use decirRT for live conversation', () => {
      disponibleCallCount = 0;
      vozUnica.hablar('Hola');
      expect(motores.vozRT.decirRT).toHaveBeenCalledWith('Hola');
      expect(motores.speakWithConfiguredEngine).not.toHaveBeenCalled();
    });

    it('should use speakWithConfiguredEngine when no live conversation', () => {
      disponibleCallCount = 0;
      motores.vozRT.disponible.mockReturnValueOnce(false);
      vozUnica.hablar('Hola');
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Hola');
      expect(motores.vozRT.decirRT).not.toHaveBeenCalled();
    });

    it('should wait for silence for aviso and then speak', () => {
      vi.useFakeTimers();
      disponibleCallCount = 0;
      // First call (in hablar) -> true (disponible)
      // Second call (in interval after 100ms) -> false (no longer disponible)
      // We'll set up the mock to return true for the first call, false for the second, and then true again (in case)
      motores.vozRT.disponible.mockImplementation(() => {
        disponibleCallCount++;
        return disponibleCallCount === 1 ? true : disponibleCallCount === 2 ? false : true;
      });
      vozUnica.hablar('Aviso', { contexto: 'aviso' });
      // Advance timers by 100ms
      vi.advanceTimersByTime(100);
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Aviso');
      expect(motores.vozRT.decirRT).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should discard aviso if no silence within 8s', () => {
      vi.useFakeTimers();
      disponibleCallCount = 0;
      // Always return true (disponible)
      motores.vozRT.disponible.mockReturnValue(true);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vozUnica.hablar('Aviso', { contexto: 'aviso' });
      // Advance timers by 8000ms
      vi.advanceTimersByTime(8000);
      expect(consoleSpy).toHaveBeenCalledWith('Aviso descartado: conversación activa después de 8s');
      expect(motores.speakWithConfiguredEngine).not.toHaveBeenCalled();
      expect(motores.vozRT.decirRT).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should queue guia and rito', () => {
      vi.useFakeTimers();
      vozUnica.hablar('Guia 1', { contexto: 'guia' });
      vozUnica.hablar('Rito 1', { contexto: 'rito' });
      vozUnica.hablar('Guia 2', { contexto: 'guia' });
      expect(motores.speakWithConfiguredEngine).not.toHaveBeenCalled();
      // Advance timers to process the queue
      vi.advanceTimersByTime(100);
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledTimes(3);
      expect(motores.speakWithConfiguredEngine).toHaveBeenNthCalledWith(1, 'Guia 1');
      expect(motores.speakWithConfiguredEngine).toHaveBeenNthCalledWith(2, 'Rito 1');
      expect(motores.speakWithConfiguredEngine).toHaveBeenNthCalledWith(3, 'Guia 2');
      vi.useRealTimers();
    });

    it('should use speakWithConfiguredEngine for other contexts', () => {
      vozUnica.hablar('Ventana', { contexto: 'ventana' });
      vozUnica.hablar('Lectura', { contexto: 'lectura' });
      vozUnica.hablar('Mando', { contexto: 'mando' });
      vozUnica.hablar('Llamada', { contexto: 'llamada' });
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledTimes(4);
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Ventana');
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Lectura');
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Mando');
      expect(motores.speakWithConfiguredEngine).toHaveBeenCalledWith('Llamada');
    });
  });

  describe('callar', () => {
    it('should callar everything', () => {
      vozUnica.callar();
      expect(motores.callarVozRT).toHaveBeenCalled();
      expect(motores.callarCola).toHaveBeenCalled();
      expect(motores.callarMezclador).toHaveBeenCalled();
      expect(motores.callarMotorLocal).toHaveBeenCalled();
    });
  });
});