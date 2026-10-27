/**
 * Adaptador de tarjeta de imágenes (IMG1011): tarjeta UI reactiva para generar y editar imágenes usando tarjetas.
 * 
 * Este test verifica el hook React useTarjetaImagenes que coordina la generación de imágenes, selección de tarjetas,
 * y gestión de acciones relacionadas (guardado en biblioteca, uso como referencia 3D, edición en protomolécula).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PeticionImagen, PlanImagen, OpcionImagen, NeuronaImg } from "@/lib/imagenes/plan";
import type { CapacidadImg, ModeloImagen } from "@/lib/imagenes/modelos";
import type { ParamsGenerarImagen, ResultadoGenerarImagen } from "@/lib/imagenes/adaptadores/generar-imagen";
import type { GuardarBibliotecaResult } from "@/lib/imagenes/adaptadores/guardar-biblioteca";

// Mock factories using vi.hoisted to allow proper typing
const { mockPlanImagen, mockGenerarImagen, mockGuardarEnBiblioteca, mockUsarComoReferencia3D, mockAbrirEnProtomoleculaEditor } = vi.hoisted(() => ({
  mockPlanImagen: vi.fn<(p: PeticionImagen, n: readonly NeuronaImg[], s: number, c?: readonly ModeloImagen[]) => Promise<PlanImagen>>(),
  mockGenerarImagen: vi.fn<(p: ParamsGenerarImagen) => Promise<ResultadoGenerarImagen>>(),
  mockGuardarEnBiblioteca: vi.fn<(p: { url: string; prompt: string; modelo: string; semilla: number }) => Promise<GuardarBibliotecaResult>>(),
  mockUsarComoReferencia3D: vi.fn<(o: OpcionImagen) => Promise<void>>(),
  mockAbrirEnProtomoleculaEditor: vi.fn<(o: OpcionImagen) => Promise<void>>(),
}));

vi.mock("@/lib/imagenes/adaptadores/plan-imagen", () => ({
  planImagen: mockPlanImagen,
}));

vi.mock("@/lib/imagenes/adaptadores/generar-imagen", () => ({
  generarImagen: mockGenerarImagen,
}));

vi.mock("@/lib/imagenes/adaptadores/guardar-biblioteca", () => ({
  guardarEnBiblioteca: mockGuardarEnBiblioteca,
}));

vi.mock("@/lib/imagenes/adaptadores/usar-como-referencia-3d", () => ({
  usarComoReferencia3D: mockUsarComoReferencia3D,
}));

vi.mock("@/lib/imagenes/adaptadores/abrir-protomolecula", () => ({
  abrirEnProtomoleculaEditor: mockAbrirEnProtomoleculaEditor,
}));

// Import the hook after mocking
import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";

describe("adaptador de tarjeta de imágenes - hook", () => {
  const peticionMock: PeticionImagen = {
    opciones: 3,
    prioridad: "calidad",
    comercial: false,
    necesita: ["texto-a-imagen"] as readonly CapacidadImg[],
    conReferencia: false,
    permisoRemoto: true,
    permitirDePago: false,
  };

  const opcionesMock: OpcionImagen[] = [
    {
      capa: "espacio",
      modelo: null,
      motor: "espacio-hf",
      cuantizacion: "nativa",
      semilla: 123,
      motivo: "Space público",
    },
    {
      capa: "espacio",
      modelo: null,
      motor: "espacio-hf",
      cuantizacion: "nativa",
      semilla: 456,
      motivo: "Space público",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe generar opciones al llamar a generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    mockPlanImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    mockPlanImagen.mockRejectedValueOnce(new Error("Error de prueba"));

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    // Give time for state to update
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
    expect(result.current.opciones).toEqual([]);
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    mockPlanImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    mockGenerarImagen.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });
    mockGuardarEnBiblioteca.mockResolvedValueOnce({ id: 1, url: "http://ejemplo.com/imagen.png", timestamp: Date.now() });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.elegirOpcion(opcionesMock[0]);
    });

    expect(mockGenerarImagen).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123,
    });
    
    expect(mockGuardarEnBiblioteca).toHaveBeenCalled();
  });

  it("debe llamar a usarComoReferencia3D al usar como referencia 3D", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    mockPlanImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    mockUsarComoReferencia3D.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    expect(mockUsarComoReferencia3D).toHaveBeenCalledWith(opcionesMock[0]);
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    mockPlanImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    mockAbrirEnProtomoleculaEditor.mockResolvedValueOnce(undefined);
    
    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });
    
    await act(async () => {
      await result.current.abrirEnProtomolecula(opcionesMock[0]);
    });
    
    expect(mockAbrirEnProtomoleculaEditor).toHaveBeenCalledWith(opcionesMock[0]);
  });
});