/**
 * Adaptador de tarjeta de imágenes (IMG1011): tarjeta UI reactiva para generar y editar imágenes usando tarjetas.
 * 
 * Este test verifica el hook React useTarjetaImagenes que coordina la generación de imágenes, selección de tarjetas,
 * y gestión de acciones relacionadas (guardado en biblioteca, uso como referencia 3D, edición en protomolécula).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/lib/imagenes/adaptadores/plan-imagen");
vi.mock("@/lib/imagenes/adaptadores/generar-imagen");
vi.mock("@/lib/imagenes/adaptadores/guardar-biblioteca");
vi.mock("@/lib/imagenes/adaptadores/usar-como-referencia-3d");
vi.mock("@/lib/imagenes/adaptadores/abrir-protomolecula");

// Importar después de los mocks
import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";

describe("adaptador de tarjeta de imágenes - hook", () => {
  const peticionMock = {
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
    const { useTarjetaImagenes: mockHook } = await import("@/lib/imagenes/adaptadores/use-tarjeta-imagenes");
    const { result } = renderHook(() => mockHook());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { useTarjetaImagenes: mockHook } = await import("@/lib/imagenes/adaptadores/use-tarjeta-imagenes");
    const { result } = renderHook(() => mockHook());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    planImagen.mockRejectedValueOnce(new Error("Error de prueba"));

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
    expect(result.current.opciones).toEqual([]);
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { useTarjetaImagenes: mockHook } = await import("@/lib/imagenes/adaptadores/use-tarjeta-imagenes");
    const { result } = renderHook(() => mockHook());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { generarImagen } = await import("@/lib/imagenes/adaptadores/generar-imagen");
    const { guardarEnBiblioteca } = await import("@/lib/imagenes/adaptadores/guardar-biblioteca");
    
    planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    generarImagen.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });
    guardarEnBiblioteca.mockResolvedValueOnce({ id: 1, url: "http://ejemplo.com/imagen.png", timestamp: Date.now() });

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
    const { useTarjetaImagenes: mockHook } = await import("@/lib/imagenes/adaptadores/use-tarjeta-imagenes");
    const { result } = renderHook(() => mockHook());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { usarComoReferencia3D } = await import("@/lib/imagenes/adaptadores/usar-como-referencia-3d");
    
    planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    usarComoReferencia3D.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    expect(usarComoReferencia3D).toHaveBeenCalledWith(opcionesMock[0]);
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { useTarjetaImagenes: mockHook } = await import("@/lib/imagenes/adaptadores/use-tarjeta-imagenes");
    const { result } = renderHook(() => mockHook());
    
    const { planImagen } = await import("@/lib/imagenes/adaptadores/plan-imagen");
    const { abrirEnProtomoleculaEditor } = await import("@/lib/imagenes/adaptadores/abrir-protomolecula");
    
    planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    abrirEnProtomoleculaEditor.mockResolvedValueOnce(undefined);
    
    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });
    
    await act(async () => {
      await result.current.abrirEnProtomolecula(opcionesMock[0]);
    });
    
    expect(abrirEnProtomoleculaEditor).toHaveBeenCalledWith(opcionesMock[0]);
  });
});
