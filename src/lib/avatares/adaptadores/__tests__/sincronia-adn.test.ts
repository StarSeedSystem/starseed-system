"use client";

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { JSDOM } from "jsdom";

// Set up jsdom environment
const jsdom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { window } = jsdom;

beforeAll(() => {
  Object.assign(global, { window });
  // @ts-ignore
  global.document = window.document;
  // Mock requestAnimationFrame and cancelAnimationFrame
  const rafMock = (callback) => {
    return setTimeout(callback, 0);
  };
  const cafMock = (id) => {
    clearTimeout(id);
  };
  window.requestAnimationFrame = rafMock;
  window.cancelAnimationFrame = cafMock;
  global.requestAnimationFrame = rafMock;
  global.cancelAnimationFrame = cafMock;
});

// Mock localStorage and window before importing the module
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => {
    const entries = Array.from(storage.entries());
    return entries[index]?.[0] || null;
  },
  get length() {
    return storage.size;
  },
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock dispatchEvent to avoid errors
window.addEventListener = vi.fn();
window.removeEventListener = vi.fn();

// Now import the module
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { sanearAdn } from "@/lib/avatares/adn/adn";
import { useAdnSincronia } from "@/lib/avatares/adaptadores/sincronia-adn";
import { loadAdnEntry, parseAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";

// Mock the dependencies from almacen-adn
vi.mock("@/lib/avatares/adaptadores/almacen-adn", () => ({
  loadAdnEntry: vi.fn(),
  parseAdnEntry: vi.fn(),
}));

const mockedLoadAdnEntry = loadAdnEntry as unknown as ReturnType<typeof vi.mock>;
const mockedParseAdnEntry = parseAdnEntry as unknown as ReturnType<typeof vi.mock>;

// Helper to create a dummy AdnAvatar
const crearAdnDePrueba = (id: string, rev: number): AdnAvatar => ({
  v: 1,
  id,
  nombre: "Avatar de Prueba",
  dueno: { tipo: "perfil" as const, id: "perfil-123" },
  base: { tipo: "orbe" },
  esqueleto: { tipo: "ninguno", articulaciones: 0 },
  morfologia: {},
  materiales: {},
  piezas: [],
  expresionBase: {},
  aura: { tono: 260, intensidad: 0.6, ligadaEmocion: true },
  movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
  visibilidad: "privado",
  procedencia: [],
  rev,
});

describe("useAdnSincronia", () => {
  afterEach(() => {
    vi.clearAllMocks();
    storage.clear();
  });

  it("envía cambios locales como evento adn", async () => {
    // Setup
    const miAvatar: any = {
      adnRef: "biblioteca:test-adn-1",
      adnRev: 1,
    };
    const enviarEvento = vi.fn();
    const setAdnLocal = vi.fn();

    const { result } = renderHook(() =>
      useAdnSincronia(miAvatar, enviarEvento, setAdnLocal)
    );

    // Mock almacen-adn functions
    mockedLoadAdnEntry.mockResolvedValue({
      id: "test-adn-1",
      kind: "avatar-adn",
      title: "Avatar de Prueba",
      url: "biblioteca:test-adn-1",
      origin: "avatar",
      savedAt: Date.now(),
      rev: 1,
      visibilidad: "privado",
      raw: JSON.stringify(crearAdnDePrueba("test-adn-1", 1)),
    });
    mockedParseAdnEntry.mockResolvedValue(crearAdnDePrueba("test-adn-1", 1));

    // Simulate that there is at least one other present to allow emission
    act(() => {
      result.current.actualizarOtrosPresentes(1);
    });
    // Simulate a local change
    const cambio: any = { op: "morfologia", clave: "altura", valor: 0.8 };
    act(() => {
      result.current.cambiarLocal([cambio]);
    });

    // Expect that an event was sent
    expect(enviarEvento).toHaveBeenCalled();
    const eventoEnviado = enviarEvento.mock.calls[0][0];
    expect(eventoEnviado.tipo).toBe("adn");
    expect(eventoEnviado.ref).toBe("biblioteca:test-adn-1");
    expect(eventoEnviado.rev).toBe(1);
    expect(eventoEnviado.cambios).toHaveLength(1);
    expect(eventoEnviado.cambios[0]).toEqual(cambio);
  });

  it("aplica evento recibido con revisión más nueva", async () => {
    // Setup
    const miAvatar: any = {
      adnRef: "biblioteca:test-adn-1",
      adnRev: 1,
    };
    const enviarEvento = vi.fn();
    const setAdnLocal = vi.fn();

    const { result } = renderHook(() =>
      useAdnSincronia(miAvatar, enviarEvento, setAdnLocal)
    );

    // Mock for the revision we expect to load (rev 2)
    mockedLoadAdnEntry.mockResolvedValueOnce({
      id: "test-adn-1",
      kind: "avatar-adn",
      title: "Avatar de Prueba",
      url: "biblioteca:test-adn-1",
      origin: "avatar",
      savedAt: Date.now(),
      rev: 2,
      visibilidad: "privado",
      raw: JSON.stringify(crearAdnDePrueba("test-adn-1", 2)),
    });
    mockedParseAdnEntry.mockResolvedValueOnce(crearAdnDePrueba("test-adn-1", 2));

    // Simulate that there is at least one other present to allow emission (if needed for internal logic)
    act(() => {
      result.current.actualizarOtrosPresentes(1);
    });
    // Simulate receiving an event with rev 2
    const eventoRecibido: any = {
      tipo: "adn",
      ref: "biblioteca:test-adn-1",
      rev: 2,
      cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }],
    };
    act(() => {
      result.current.recibirEvento(eventoRecibido);
    });

    // Debug: see what was called
    console.log('mockedLoadAdnEntry calls:', mockedLoadAdnEntry.mock.calls);
    console.log('mockedParseAdnEntry calls:', mockedParseAdnEntry.mock.calls);
    // Expect that loadAdnEntry was called with the ref and rev
    expect(mockedLoadAdnEntry).toHaveBeenCalledWith("biblioteca:test-adn-1", 2);
    expect(mockedParseAdnEntry).toHaveBeenCalled();
    // Expect that setAdnLocal was called
    expect(setAdnLocal).toHaveBeenCalled();
    const adnPasado = setAdnLocal.mock.calls[0][0];
    expect(adnPasado).toEqual(crearAdnDePrueba("test-adn-1", 2));
    // The cambio should have been applied (altura 0.9)
    expect(adnPasado.morfologia.altura).toBe(0.9);
  });

  it("ignora evento recibido con revisión no más nueva", async () => {
    // Setup
    const miAvatar: any = {
      adnRef: "biblioteca:test-adn-1",
      adnRev: 2,
    };
    const enviarEvento = vi.fn();
    const setAdnLocal = vi.fn();

    const { result } = renderHook(() =>
      useAdnSincronia(miAvatar, enviarEvento, setAdnLocal)
    );

    // Mock almacen-adn functions (not needed for this test because we ignore if rev not newer)
    // But we'll set up a mock anyway
    mockedLoadAdnEntry.mockResolvedValue({
      id: "test-adn-1",
      kind: "avatar-adn",
      title: "Avatar de Prueba",
      url: "biblioteca:test-adn-1",
      origin: "avatar",
      savedAt: Date.now(),
      rev: 2,
      visibilidad: "privado",
      raw: JSON.stringify(crearAdnDePrueba("test-adn-1", 2)),
    });
    mockedParseAdnEntry.mockResolvedValue(crearAdnDePrueba("test-adn-1", 2));

    // Simulate that there is at least one other present (not strictly needed for this test)
    act(() => {
      result.current.actualizarOtrosPresentes(1);
    });
    // Simulate receiving an event with rev 1 (older)
    const eventoRecibido: any = {
      tipo: "adn",
      ref: "biblioteca:test-adn-1",
      rev: 1,
      cambios: [{ op: "morfologia", clave: "altura", valor: 0.8 }],
    };
    act(() => {
      result.current.recibirEvento(eventoRecibido);
    });

    // Expect that setAdnLocal was NOT called
    expect(setAdnLocal).not.toHaveBeenCalled();
  });
});