/**
 * Adaptador de tarjeta de imágenes (IMG1011): tarjeta UI reactiva para generar y editar imágenes usando tarjetas.
 * 
 * Este test verifica el hook React useTarjetaImagenes que coordina la generación de imágenes, selección de tarjetas,
 * y gestión de acciones relacionadas (guardado en biblioteca, uso como referencia 3D, edición en protomolécula).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";

const h = vi.hoisted(() => ({
  planImagen: { planImagen: vi.fn() },
  generarImagen: { generarImagen: vi.fn() },
  guardarEnBiblioteca: { guardarEnBiblioteca: vi.fn() },
  usarComoReferencia3D: { usarComoReferencia3D: vi.fn() },
  abrirEnProtomolecula: { abrirProtomoleculaEditor: vi.fn() },
}));

vi.mock("@/lib/imagenes/adaptadores/use-tarjeta-imagenes", () => ({
  useTarjetaImagenes: h,
}));

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
    const { result } = renderHook(() => useTarjetaImagenes());
    
    h.planImagen.planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    h.planImagen.planImagen.mockRejectedValueOnce(new Error("Error de prueba"));

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
    expect(result.current.opciones).toEqual([]);
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    h.planImagen.planImagen.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    h.generarImagen.generarImagen.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockResolvedValueOnce({ id: 1 });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      result.current.elegirOpcion(opcionesMock[0]);
    });

    expect(h.generarImagen.generarImagen).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123,
    });
    
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).toHaveBeenCalled();
  });

  it("debe llamar a usarComoReferencia3D al usar como referencia 3D", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    h.usarComoReferencia3D.usarComoReferencia3D.mockResolvedValueOnce(undefined);

    await act(async () => {
      result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    expect(h.usarComoReferencia3D.usarComoReferencia3D).toHaveBeenCalledWith("http://ejemplo.com/imagen.png");
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    h.abrirEnProtomolecula.abrirProtomoleculaEditor.mockResolvedValueOnce(undefined);
    
    await act(async () => {
      result.current.abrirEnProtomolecula(opcionesMock[0]);
    });
    
    expect(h.abrirEnProtomolecula.abrirProtomoleculaEditor).toHaveBeenCalledWith("http://ejemplo.com/imagen.png");
  });
});
