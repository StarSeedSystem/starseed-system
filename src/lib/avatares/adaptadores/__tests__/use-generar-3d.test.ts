/**
 * Avatares 3D · pruebas del hook use-generar-3d (G3D1011E). PURO: sin red, sin disco, sin GPU.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useGenerar3d } from "../use-generar-3d";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the dependencies
vi.mock("../use-generar-3d", () => {
  const actual = vi.requireActual("../use-generar-3d");
  return {
    ...actual,
    // Mock the internal functions
    seleccionarImagen: vi.fn(),
    contienePersonas: vi.fn(),
    planParaNeurona: vi.fn(),
    saveAdnToLibrary: vi.fn(),
    usoPermitido: vi.fn(),
  };
});

const { seleccionarImagen, contienePersonas, planParaNeurona, saveAdnToLibrary, usoPermitido } = 
  require("../use-generar-3d");

describe("use-generar-3d hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct default values", () => {
    const { result } = renderHook(() => useGenerar3d());
    
    expect(result.current.cargando).toBe(false);
    expect(result.current.progreso).toBe(0);
    expect(result.current.mensaje).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.resultado).toBeNull();
    expect(result.current.planActual).toBeNull();
  });

  it("should start generation when iniciarGeneracion is called", async () => {
    // Setup mocks
    seleccionarImagen.mockResolvedValue(new File(["test"], "test.png", { type: "image/png" }));
    contienePersonas.mockResolvedValue(false);
    planParaNeurona.mockReturnValue({ 
      plan: { 
        pasos: [ 
          { etapa: "generar", motor: null, saltada: true, motivo: "", descartes: [] } 
        ], 
        listo: true,
        procedencia: []
      } 
    });
    saveAdnToLibrary.mockResolvedValue(undefined);
    usoPermitido.mockReturnValue({ ok: true, motivos: [], atribuciones: [] });

    const { result } = renderHook(() => useGenerar3d());
    
    // Call the function
    result.current.iniciarGeneracion("avatar", "soma30");
    
    // Wait for loading state
    await waitFor(() => {
      expect(result.current.cargando).toBe(true);
    });
    
    // Verify progress updates
    expect(result.current.progreso).toBeGreaterThan(0);
    expect(result.current.mensaje).toContain("Seleccionando");
  });

  it("should handle error when no image is selected", async () => {
    seleccionarImagen.mockResolvedValue(null);

    const { result } = renderHook(() => useGenerar3d());
    
    await result.current.iniciarGeneracion("avatar", "soma30");
    
    expect(result.current.error).toBe("No se seleccionó ninguna imagen");
    expect(result.current.cargando).toBe(false);
  });

  it("should handle persona detection for remote space permission", async () => {
    seleccionarImagen.mockResolvedValue(new File(["test"], "test.png", { type: "image/png" }));
    contienePersonas.mockResolvedValue(true); // Image contains people
    planParaNeurona.mockReturnValue({ plan: null }); // No local capability

    const { result } = renderHook(() => useGenerar3d());
    
    await result.current.iniciarGeneracion("avatar", "soma30");
    
    expect(result.current.error).toContain("permiso explícito");
    expect(result.current.cargando).toBe(false);
  });

  it("should reset state when reiniciar is called", async () => {
    seleccionarImagen.mockResolvedValue(new File(["test"], "test.png", { type: "image/png" }));
    contienePersonas.mockResolvedValue(false);
    
    const { result } = renderHook(() => useGenerar3d());
    
    // Start generation
    result.current.iniciarGeneracion("avatar", "soma30");
    
    // Wait for loading
    await waitFor(() => {
      expect(result.current.cargando).toBe(true);
    });
    
    // Reset
    result.current.reiniciar();
    
    // Check reset state
    expect(result.current.cargando).toBe(false);
    expect(result.current.progreso).toBe(0);
    expect(result.current.mensaje).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.resultado).toBeNull();
    expect(result.current.planActual).toBeNull();
  });

  it("should return result when generation completes", async () => {
    const mockResultado = {
      id: "test-id",
      rev: 1,
      dueno: { tipo: "perfil", id: "test" },
      base: { ref: "biblioteca:test" },
      esqueleto: "soma30",
      morfologia: {},
      materiales: {},
      piezas: {},
      expresiones: {},
      aura: { tipo: "ninguna", intensidad: 0 },
      movimiento: { caracter: "tranquilo", intensidad: 0.5 },
      visibilidad: "privado",
      procedencia: [{ herramienta: "test-tool", licencia: "MIT", uso: "libre" }],
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
    };

    seleccionarImagen.mockResolvedValue(new File(["test"], "test.png", { type: "image/png" }));
    contienePersonas.mockResolvedValue(false);
    planParaNeurona.mockReturnValue({ 
      plan: { 
        pasos: [ 
          { etapa: "generar", motor: null, saltada: true, motivo: "", descartes: [] } 
        ],
        listo: true,
        procedencia: [{ herramienta: "test-tool", licencia: "MIT", uso: "libre" }]
      } 
    });
    saveAdnToLibrary.mockResolvedValue(undefined);
    usoPermitido.mockReturnValue({ ok: true, motivos: [], atribuciones: ["Modelo 3D generado con test-tool"] });

    const { result } = renderHook(() => useGenerar3d());
    
    await result.current.iniciarGeneracion("avatar", "soma30");
    
    // Wait for completion
    await waitFor(() => {
      return result.current.resultado !== null;
    }, { timeout: 5000 });
    
    expect(result.current.resultado).toMatchObject({
      id: expect.stringContaining("generado-"),
      esqueleto: "soma30",
      visibilidad: "privado",
      procedencia: expect.arrayContaining([{ herramienta: "test-tool", licencia: "MIT", uso: "libre" }])
    });
    expect(result.current.cargando).toBe(false);
    expect(result.current.progreso).toBe(100);
  });

  it("should show plan details in message", async () => {
    seleccionarImagen.mockResolvedValue(new File(["test"], "test.png", { type: "image/png" }));
    contienePersonas.mockResolvedValue(false);
    planParaNeurona.mockReturnValue({ 
      plan: { 
        pasos: [
          { etapa: "generar", motor: { nombre: "Test Motor", minutosAprox: 2 }, saltada: false, motivo: "Test motivo", descartes: [] },
          { etapa: "remallar", motor: { nombre: "Remallado Motor", minutosAprox: 1 }, saltada: true, motivo: "Ya tiene malla", descartes: [] }
        ], 
        listo: true,
        procedencia: []
      } 
    });
    saveAdnToLibrary.mockResolvedValue(undefined);
    usoPermitido.mockReturnValue({ ok: true, motivos: [], atribuciones: [] });

    const { result } = renderHook(() => useGenerar3d());
    
    await result.current.iniciarGeneracion("avatar", "soma30");
    
    // Wait for plan to be set
    await waitFor(() => {
      return result.current.planActual !== null;
    });
    
    expect(result.current.planActual).toBeTruthy();
    expect(result.current.mensaje).toContain("Plan:");
    expect(result.current.mensaje).toContain("generar: Test Motor");
    expect(result.current.mensaje).toContain("remallar: SALTADO");
  });
});