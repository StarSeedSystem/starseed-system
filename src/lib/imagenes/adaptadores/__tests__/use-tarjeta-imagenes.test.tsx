/**
 * Adaptador de tarjeta de imágenes (IMG1011): tarjeta UI reactiva para generar y editar imágenes usando tarjetas.
 * 
 * Este test verifica el hook React useTarjetaImagenes que coordina la generación de imágenes, selección de tarjetas,
 * y gestión de acciones relacionadas (guardado en biblioteca, uso como referencia 3D, edición en protomolécula).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PeticionImagen } from "@/lib/imagenes/plan";

// Mock all the dependencies before importing the hook
vi.mock("@/lib/imagenes/adaptadores/plan-imagen", () => ({
  planImagen: vi.fn(),
}));

vi.mock("@/lib/imagenes/adaptadores/generar-imagen", () => ({
  generarImagen: vi.fn(),
}));

vi.mock("@/lib/imagenes/adaptadores/guardar-biblioteca", () => ({
  guardarEnBiblioteca: vi.fn(),
}));

vi.mock("@/lib/imagenes/adaptadores/usar-como-referencia-3d", () => ({
  usarComoReferencia3D: vi.fn(),
}));

vi.mock("@/lib/imagenes/adaptadores/abrir-protomolecula", () => ({
  abrirEnProtomoleculaEditor: vi.fn(),
}));

// Import the hook after mocking
import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";

describe("adaptador de tarjeta de imágenes - hook", () => {
  const peticionMock: PeticionImagen = {
    opciones: 3,
    prioridad: "calidad" as const,
    comercial: false,
    necesita: ["texto-a-imagen"],
    conReferencia: false,
    permisoRemoto: true,
    permitirDePago: false,
  };

  const opcionesMock = [
    {
      capa: "espacio" as const,
      modelo: null,
      motor: "espacio-hf" as const,
      cuantizacion: "nativa" as const,
      semilla: 123,
      motivo: "Space público",
    },
    {
      capa: "espacio" as const,
      modelo: null,
      motor: "espacio-hf" as const,
      cuantizacion: "nativa" as const,
      semilla: 456,
      motivo: "Space público",
    },
  ];

  it("debe generar opciones al llamar a generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    vi.mocked(planImagen).mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    vi.mocked(planImagen).mockRejectedValueOnce(new Error("Error de prueba"));

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
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { generarImagen } = await import("@/lib/imagenes/adaptadores/generar-imagen");
    const { guardarEnBiblioteca } = await import("@/lib/imagenes/adaptadores/guardar-biblioteca");
    
    vi.mocked(planImagen).mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    vi.mocked(generarImagen).mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });
    vi.mocked(guardarEnBiblioteca).mockResolvedValueOnce({ id: 1, url: "http://ejemplo.com/imagen.png", timestamp: Date.now() });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.elegirOpcion(opcionesMock[0]);
    });

    expect(generarImagen).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123,
    });
    
    expect(guardarEnBiblioteca).toHaveBeenCalled();
  });

  it("debe llamar a usarComoReferencia3D al usar como referencia 3D", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { usarComoReferencia3D } = await import("@/lib/imagenes/adaptadores/usar-como-referencia-3d");
    
    vi.mocked(planImagen).mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    vi.mocked(usarComoReferencia3D).mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    expect(usarComoReferencia3D).toHaveBeenCalledWith(opcionesMock[0]);
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { abrirEnProtomoleculaEditor } = await import("@/lib/imagenes/adaptadores/abrir-protomolecula");
    
    vi.mocked(planImagen).mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    vi.mocked(abrirEnProtomoleculaEditor).mockResolvedValueOnce(undefined);
    
    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });
    
    await act(async () => {
      await result.current.abrirEnProtomolecula(opcionesMock[0]);
    });
    
    expect(abrirEnProtomoleculaEditor).toHaveBeenCalledWith(opcionesMock[0]);
  });
});
