import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock document for canvas creation
global.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({}),
  }),
};

import { TipoAlcance, Sesion } from '../../recursos/sesion-prestamo';

// Mock de las dependencias
const mockCapturar = vi.fn();
const mockDibujar = vi.fn();
const mockCrearPista = vi.fn();

describe('crearAnfitrion', () => {
  let crearAnfitrion: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Stub animation frame functions using the vi mock timers
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      return setTimeout(callback, 0);
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      clearTimeout(id);
    });
    mockCapturar.mockReset();
    mockDibujar.mockReset();
    mockCrearPista.mockReset();

    // Import the module after stubbing globals
    const module = await import('../anfitrion');
    crearAnfitrion = module.crearAnfitrion;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debería crear un anfitrión con los métodos esperados', () => {
    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: Date.now(),
      vence: Date.now() + 10000,
      revocada: false,
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);

    expect(typeof anfitrion.obtenerPista).toBe('function');
    expect(typeof anfitrion.iniciar).toBe('function');
    expect(typeof anfitrion.detener).toBe('function');
  });

  it('debería iniciar el bucle de animación al llamar a iniciar', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now,
      vence: now + 10000,
      revocada: false,
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    anfitrion.iniciar();

    // Simular el paso de tiempo para que se ejecute el bucle
    vi.advanceTimersByTime(16); // aproximadamente 60 fps

    expect(mockCapturar).toHaveBeenCalled();
    expect(mockDibujar).toHaveBeenCalled();
  });

  it('debería detener el bucle cuando la sesión se revoca', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now,
      vence: now + 10000,
      revocada: true, // sesión revocada
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    anfitrion.iniciar();

    // Simular el paso de tiempo
    vi.advanceTimersByTime(16);

    // Como la sesión está revocada, el bucle debería haberse detenido
    // No deberíamos esperar más llamadas a capturar después de la primera
    // Pero como el bucle se detiene antes de hacer la captura, esperamos que no se llame
    expect(mockCapturar).not.toHaveBeenCalled();
  });

  it('debería detener el bucle cuando la sesión expira', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now - 20000,
      vence: now - 10000, // ya expiró
      revocada: false,
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    anfitrion.iniciar();

    // Simular el paso de tiempo
    vi.advanceTimersByTime(16);

    expect(mockCapturar).not.toHaveBeenCalled();
  });

  it('debería llamar a capturar y dibujar en cada fotograma', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now,
      vence: now + 10000,
      revocada: false,
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    anfitrion.iniciar();

    // Simular dos fotogramas
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);

    expect(mockCapturar).toHaveBeenCalledTimes(2);
    expect(mockDibujar).toHaveBeenCalledTimes(2);
  });

  it('debería devolver una pista nula si crearPista devuelve nulo', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now,
      vence: now + 10000,
      revocada: false,
    };

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista.mockReturnValue(null),
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    expect(anfitrion.obtenerPista()).toBeNull();
  });

  it('debería crear una pista cuando se llama a crearPista', () => {
    // Set the system time to a fixed timestamp
    const now = 1000000;
    vi.setSystemTime(now);

    const sesion: Sesion = {
      id: 'sesion-1',
      anfitrion: 'anfitrion-1',
      invitado: 'invitado-1',
      alcance: { tipo: 'app', id: 'app-1' },
      inicio: now,
      vence: now + 10000,
      revocada: false,
    };

    const pistaMock = {} as MediaStreamTrack;
    mockCrearPista.mockReturnValue(pistaMock);

    const config = {
      capturar: mockCapturar,
      dibujar: mockDibujar,
      crearPista: mockCrearPista,
      sesion,
      fps: 30,
      anchoMax: 800,
    };

    const anfitrion = crearAnfitrion(config);
    expect(anfitrion.obtenerPista()).toBe(pistaMock);
  });
});