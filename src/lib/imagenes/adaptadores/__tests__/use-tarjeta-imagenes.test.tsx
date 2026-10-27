// @vitest-environment jsdom
/**
 * useTarjetaImagenes: hook para manejar la tarjeta de opciones de imagen
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    planImagen: {
        planImagen: vi.fn()
    },
    generarImagen: {
        generarImagen: vi.fn()
    },
    guardarEnBiblioteca: {
        guardarEnBiblioteca: vi.fn()
    },
    usarComoReferencia3D: {
        usarComoReferencia3D: vi.fn()
    },
    abrirEnProtomolecula: {
        abrirEnProtomolecula: vi.fn()
    }
}));

vi.mock("../../plan", () => h.planImagen);
vi.mock("@/lib/integrations/aurora-tools", () => h.generarImagen);
vi.mock("@/lib/library", () => h.guardarEnBiblioteca);
vi.mock("@/lib/avatares/referencia3d", () => h.usarComoReferencia3D);
vi.mock("@/lib/protomolecula/editor", () => h.abrirEnProtomolecula);

// Importamos el hook que estamos probando
import { useTarjetaImagenes } from "../use-tarjeta-imagenes.ts";

const peticionMock = {
    opciones: 4,
    prioridad: "calidad",
    comercial: false,
    necesita: ["texto-a-imagen"],
    conReferencia: false,
    permisoRemoto: false,
    permitirDePago: false
};

const opcionesMock = [
    {
      id: 1,
      capa: "dispositivo",
      modelo: { id: "sd-turbo", label: "SD Turbo" },
      semilla: 123,
      prompt: "Una imagen de prueba",
      uso: "libre"
    },
    {
      id: 2,
      capa: "malla",
      modelo: { id: "sdxl", label: "SDXL" },
      semilla: 124,
      prompt: "Una imagen de prueba",
      uso: "libre"
    }
  ];

describe("useTarjetaImagenes", () => {
  beforeEach(() => {
    h.planImagen.planImagen.mockReset();
    h.generarImagen.generarImagen.mockReset();
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockReset();
    h.usarComoReferencia3D.usarComoReferencia3D.mockReset();
    h.abrirEnProtomolecula.abrirEnProtomolecula.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debe generar opciones al llamar a generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de planImagen para devolver un valor resuelto
    h.planImagen.planImagen.mockResolvedValueOnce({ opciones: opcionesMock });

    // Llamar a la función
    await act(async () => {
      result.current.generarOpciones(peticionMock);
    });

    // Esperar a que se resuelva la promesa y actualice el estado
    await act(async () => {
      // En un entorno real, necesitaríamos esperar a que se actualice el estado
      // Pero como estamos mockeando, asumimos que se actualiza inmediatamente
    });

    // Verificar que las opciones se actualizaron
    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de planImagen para rechazar
    h.planImagen.planImagen.mockRejectedValueOnce(new Error("Error de prueba"));

    // Llamar a la función
    await act(async () => {
      result.current.generarOpciones(peticionMock);
    });

    // Esperar a que se resuelva la promesa y actualice el estado
    await act(async () => {
      // Esperar a que se actualice el estado
    });

    // Verificar que se estableció el error
    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de generarImagen
    h.generarImagen.generarImagen.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });

    // También necesitamos mockear guardarEnBiblioteca
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockResolvedValueOnce({ id: 1 });

    // Llamar a la función
    await act(async () => {
      result.current.elegirOpcion(opcionesMock[0]);
    });

    // Esperar a que se resuelva la promesa
    await act(async () => {
      // Esperar a que se actualice el estado
    });

    // Verificar que se llamó a generarImagen con los parámetros correctos
    expect(h.generarImagen.generarImagen).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123
      // Otros parámetros que puedan ser necesarios
    });
    
    // Verificar que se llamó a guardarEnBiblioteca
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).toHaveBeenCalled();
  });

  it("debe llamar a usarComoReferencia3D al usar como referencia 3D", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock
    h.usarComoReferencia3D.usarComoReferencia3D.mockResolvedValueOnce(undefined);

    // Llamar a la función
    await act(async () => {
      result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    // Verificar que se llamó
    expect(h.usarComoReferencia3D.usarComoReferencia3D).toHaveBeenCalledWith("http://ejemplo.com/imagen.png");
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock
    h.abrirEnProtomolecula.abrirEnProtomolecula.mockResolvedValueOnce(undefined);
    
    // Llamar a la función
    await act(async () => {
      result.current.abrirEnProtomolecula(opcionesMock[0]);
    });
    
    // Verificar que se llamó
    expect(h.abrirEnProtomolecula.abrirEnProtomolecula).toHaveBeenCalledWith("http://ejemplo.com/imagen.png");
  });
});