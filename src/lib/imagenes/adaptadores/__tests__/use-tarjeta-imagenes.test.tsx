import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTarjetaImagenes } from "../use-tarjeta-imagenes";

// Mock the dependencies
vi.mock("../planImagen", () => ({ planImagen: { planImagen: vi.fn() } }));
vi.mock("../generarImagen", () => ({ generarImagen: { generarImagen: vi.fn() } }));
vi.mock("../guardarEnBiblioteca", () => ({ guardarEnBiblioteca: { guardarEnBiblioteca: vi.fn() } }));
vi.mock("../usarComoReferencia3D", () => ({ usarComoReferencia3D: { usarComoReferencia3D: vi.fn() } }));
vi.mock("../abrirEnProtomolecula", () => ({ abrirEnProtomolecula: { abrirProtomoleculaEditor: vi.fn() } }));

// We'll need to import the mocked modules to access the mock functions
import { planImagen } from "../planImagen";
import { generarImagen } from "../generarImagen";
import { guardarEnBiblioteca } from "../guardarEnBiblioteca";
import { usarComoReferencia3D } from "../usarComoReferencia3D";
import { abrirEnProtomolecula } from "../abrirEnProtomolecula";

describe("useTarjetaImagenes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("debe generar opciones al llamar a generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de planImagen para devolver un valor resuelto
    const opcionesMock = [
      { url: "http://ejemplo.com/imagen1.png" },
      { url: "http://ejemplo.com/imagen2.png" }
    ];
    const peticionMock = {
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123
    };
    planImagen.planImagen.mockResolvedValueOnce({ opciones: opcionesMock });

    // Llamar a la función
    await act(async () => {
      result.current.generarOpciones(peticionMock);
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de planImagen para rechazar
    planImagen.planImagen.mockRejectedValueOnce(new Error("Error de prueba"));

    // Llamar a la función
    await act(async () => {
      result.current.generarOpciones({
        prompt: "Una imagen de prueba",
        modelo: "sd-turbo",
        semilla: 123
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    
    // Configurar el mock de generarImagen
    generarImagen.generarImagen.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });

    // También necesitamos mockear guardarEnBiblioteca
    guardarEnBiblioteca.guardarEnBiblioteca.mockResolvedValueOnce({ id: 1 });

    // Llamar a la función
    await act(async () => {
      result.current.elegirOpcion({
        url: "http://ejemplo.com/imagen.png",
        prompt: "Una imagen de prueba",
        modelo: "sd-turbo",
        semilla: 123
      });
    });

    // Esperar a que se resuelva la promesa
    await act(async () => {
      // Esperar a que se actualice el estado
    });

    // Verificar que se llamó a generarImagen con los parámetros correctos
    expect(generarImagen.generarImagen).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123
      // Otros parámetros que puedan ser necesarios
    });
    
    // Verificar que se llamó a guardarEnBiblioteca
    expect(guardarEnBiblioteca.guardarEnBiblioteca).toHaveBeenCalled();
  });
    });

    // Verificar que se estableció el error
    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
  });

    // Verificar que las opciones se actualizaron
    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });
});