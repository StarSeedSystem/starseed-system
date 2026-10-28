/**
 * Adaptador de tarjeta de imágenes (IMG1011): coordenación del hook useTarjetaImagenes.
 *
 * Rescate de pruebas de la rama nube/a1-20261023-010528-RTAV1011Dd-d2, adaptado al hook de hoy.
 * Se maquetan los cinco adaptadores que usa el hook (plan-imagen, generar-imagen, guardar-biblioteca,
 * usar-como-referencia-3d y abrir-protomolecula) para probar el estado y las llamadas sin red.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeticionImagen } from "@/lib/imagenes/plan";

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

import { useTarjetaImagenes } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import { planImagen } from "@/lib/imagenes/adaptadores/plan-imagen";
import { generarImagen } from "@/lib/imagenes/adaptadores/generar-imagen";
import { guardarEnBiblioteca } from "@/lib/imagenes/adaptadores/guardar-biblioteca";
import { usarComoReferencia3D } from "@/lib/imagenes/adaptadores/usar-como-referencia-3d";
import { abrirEnProtomoleculaEditor } from "@/lib/imagenes/adaptadores/abrir-protomolecula";

const planImagenMock = vi.mocked(planImagen);
const generarImagenMock = vi.mocked(generarImagen);
const guardarEnBibliotecaMock = vi.mocked(guardarEnBiblioteca);
const usarComoReferencia3DMock = vi.mocked(usarComoReferencia3D);
const abrirEnProtomoleculaMock = vi.mocked(abrirEnProtomoleculaEditor);

const peticionMock: PeticionImagen = {
  opciones: 2,
  prioridad: "calidad",
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("adaptador de tarjeta de imágenes - hook", () => {
  it("debe generar opciones al llamar a generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    planImagenMock.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.opciones).toEqual(opcionesMock);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("debe manejar errores en generarOpciones", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    planImagenMock.mockRejectedValueOnce(new Error("Error de prueba"));

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    expect(result.current.error).toBe("Error de prueba");
    expect(result.current.cargando).toBe(false);
    expect(result.current.opciones).toEqual([]);
  });

  it("debe llamar a generarImagen al elegir una opción", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    planImagenMock.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    generarImagenMock.mockResolvedValueOnce({ ok: true, url: "http://ejemplo.com/imagen.png" });
    guardarEnBibliotecaMock.mockResolvedValueOnce({ id: 1, url: "http://ejemplo.com/imagen.png", timestamp: Date.now() });

    await act(async () => {
      await result.current.generarOpciones(peticionMock);
    });

    await act(async () => {
      await result.current.elegirOpcion(opcionesMock[0]);
    });

    expect(generarImagenMock).toHaveBeenCalledWith({
      prompt: "Una imagen de prueba",
      modelo: "sd-turbo",
      semilla: 123,
    });
    expect(guardarEnBibliotecaMock).toHaveBeenCalled();
  });

  it("debe llamar a usarComoReferencia3D al usar como referencia 3D", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    planImagenMock.mockResolvedValueOnce({ opciones: opcionesMock, descartes: [] });
    usarComoReferencia3DMock.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.usarComoReferencia3D(opcionesMock[0]);
    });

    expect(usarComoReferencia3DMock).toHaveBeenCalledWith(opcionesMock[0]);
  });

  it("debe llamar a abrirEnProtomolecula al editar en Protomolécula", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    abrirEnProtomoleculaMock.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.abrirEnProtomolecula(opcionesMock[0]);
    });

    expect(abrirEnProtomoleculaMock).toHaveBeenCalledWith(opcionesMock[0]);
  });
});
