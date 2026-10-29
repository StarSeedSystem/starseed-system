// @vitest-environment jsdom
/**
 * useTarjetaImagenes (IMG1011C, parte 2): planificación por capas y acciones reales de la tarjeta.
 * Sin red, sin disco y sin GPU: media-gen, la Biblioteca, la Protomolécula y el taller 3D van mockeados.
 * También se prueban las funciones puras del módulo (proveedor por capa y título para la Biblioteca).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODELOS_IMAGEN } from "../../modelos";

const h = vi.hoisted(() => ({
  planImagen: vi.fn(),
  generateImage: vi.fn(),
  guardarEnBiblioteca: vi.fn(),
  usarComoReferencia3D: vi.fn(),
  abrirProtomoleculaEditor: vi.fn(),
  borradorPublicacion: vi.fn(),
  malla: { misDispositivos: [], cercanas: [], loading: false }
}));

vi.mock("../../plan", () => ({ planImagen: h.planImagen }));
vi.mock("@/ai/astraura/media/media-gen", () => ({ generateImage: h.generateImage }));
vi.mock("@/lib/library", () => ({ guardarEnBiblioteca: h.guardarEnBiblioteca }));
vi.mock("@/lib/avatares/referencia3d", () => ({ usarComoReferencia3D: h.usarComoReferencia3D }));
vi.mock("@/lib/protomolecula/editor", () => ({
  abrirEnProtomolecula: { abrirProtomoleculaEditor: h.abrirProtomoleculaEditor }
}));
vi.mock("@/lib/publicacion/borrador", () => ({ borradorPublicacion: h.borradorPublicacion }));
vi.mock("@/lib/network/malla-neuronas", () => ({ useMallaNeuronasEstado: () => h.malla }));

import {
  proveedorParaOpcion,
  tituloDeOpcion,
  useTarjetaImagenes,
  type OpcionTarjetaImagen,
  type PeticionConPrompt
} from "../use-tarjeta-imagenes";

const SD = MODELOS_IMAGEN.find((m) => m.id === "sd-turbo") ?? MODELOS_IMAGEN[0];
const OPCION: OpcionTarjetaImagen = {
  capa: "dispositivo",
  neuronaId: "neurona-1",
  modelo: SD,
  motor: "sdcpp",
  cuantizacion: "q4",
  semilla: 123,
  motivo: "Cabe en tu aparato a 4 bits.",
  prompt: "Un faro al atardecer"
};
const PETICION: PeticionConPrompt = {
  opciones: 2,
  prioridad: "rapidez",
  comercial: false,
  necesita: ["texto-a-imagen"],
  conReferencia: false,
  permisoRemoto: true,
  permitirDePago: false,
  prompt: "Un faro al atardecer"
};

async function montarConPlan(opcion: OpcionTarjetaImagen = OPCION) {
  h.planImagen.mockReturnValueOnce({ opciones: [opcion], descartes: ["Una neurona ocupada."] });
  const { result } = renderHook(() => useTarjetaImagenes());
  await act(async () => {
    await result.current.generarOpciones(PETICION);
  });
  return result;
}

beforeEach(() => {
  h.planImagen.mockReset();
  h.generateImage.mockReset();
  h.guardarEnBiblioteca.mockReset();
  h.usarComoReferencia3D.mockReset();
  h.abrirProtomoleculaEditor.mockReset();
  h.borradorPublicacion.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("funciones puras de la tarjeta", () => {
  it("manda la web gratis a Pollinations y el resto a las neuronas", () => {
    expect(proveedorParaOpcion({ capa: "web-gratis", motor: "pollinations" })).toBe("pollinations");
    expect(proveedorParaOpcion({ capa: "dispositivo", motor: "sdcpp" })).toBe("neuronas");
    expect(proveedorParaOpcion({ capa: "espacio", motor: "espacio-hf" })).toBe("neuronas");
    expect(proveedorParaOpcion({ capa: "neurona", motor: "comfyui" })).toBe("comfyui");
  });

  it("compone un título legible para la Biblioteca", () => {
    expect(tituloDeOpcion(OPCION)).toBe(`${SD.nombre} · Un faro al atardecer`);
    expect(tituloDeOpcion({ prompt: "   ", modelo: null })).toBe("Imagen generada con Astraura");
  });
});

describe("useTarjetaImagenes · elegir y variar", () => {
  it("genera SOLO la opción elegida, con su semilla, modelo y proveedor", async () => {
    h.generateImage.mockResolvedValueOnce({ ok: true, url: "https://img.ejemplo/uno.png", provider: "neuronas" });
    const result = await montarConPlan();
    await act(async () => {
      await result.current.elegirOpcion(result.current.opciones[0]);
    });
    expect(h.generateImage).toHaveBeenCalledTimes(1);
    expect(h.generateImage).toHaveBeenCalledWith({
      prompt: "Un faro al atardecer",
      seed: 123,
      provider: "neuronas",
      model: SD.id
    });
    expect(result.current.opciones[0]).toMatchObject({ url: "https://img.ejemplo/uno.png", elegida: true });
    expect(result.current.error).toBeNull();
  });

  it("la web gratis elegida se pide a Pollinations y no manda modelo local", async () => {
    const web: OpcionTarjetaImagen = {
      capa: "web-gratis",
      modelo: null,
      motor: "pollinations",
      cuantizacion: "nativa",
      semilla: 7,
      motivo: "Sale gratis por la web.",
      prompt: "Un faro al atardecer"
    };
    h.generateImage.mockResolvedValueOnce({ ok: true, url: "https://img.ejemplo/web.png", provider: "pollinations" });
    const result = await montarConPlan(web);
    await act(async () => {
      await result.current.elegirOpcion(result.current.opciones[0]);
    });
    expect(h.generateImage).toHaveBeenCalledWith({
      prompt: "Un faro al atardecer",
      seed: 7,
      provider: "pollinations"
    });
  });

  it("sin prompt no llama al motor y lo dice", async () => {
    h.planImagen.mockReturnValueOnce({ opciones: [{ ...OPCION, prompt: undefined }], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => {
      await result.current.generarOpciones({ ...PETICION, prompt: undefined });
    });
    await act(async () => {
      await result.current.elegirOpcion(result.current.opciones[0]);
    });
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Describe qué imagen/);
  });

  it("variar pide más semillas del mismo modelo y las añade a la rejilla", async () => {
    h.generateImage.mockImplementation(({ seed }: { seed: number }) =>
      Promise.resolve({ ok: true, url: `https://img.ejemplo/${seed}.png`, provider: "neuronas" }));
    const result = await montarConPlan();
    let nuevas: OpcionTarjetaImagen[] = [];
    await act(async () => {
      nuevas = await result.current.variarOpcion(result.current.opciones[0], 3);
    });
    expect(h.generateImage).toHaveBeenCalledTimes(3);
    expect(h.generateImage.mock.calls.map((c) => (c[0] as { seed: number }).seed)).toEqual([124, 125, 126]);
    expect(nuevas).toHaveLength(3);
    expect(result.current.opciones).toHaveLength(4);
    expect(result.current.opciones.every((o) => o.modelo?.id === SD.id)).toBe(true);
    expect(result.current.opciones.slice(1).map((o) => o.semilla)).toEqual([124, 125, 126]);
  });

  it("variar conserva las variaciones que sí salieron aunque otra semilla falle", async () => {
    h.generateImage
      .mockResolvedValueOnce({ ok: true, url: "https://img.ejemplo/124.png", provider: "neuronas" })
      .mockRejectedValueOnce(new Error("Se cayó el motor"))
      .mockResolvedValueOnce({ ok: true, url: "https://img.ejemplo/126.png", provider: "neuronas" });
    const result = await montarConPlan();
    await act(async () => {
      await result.current.variarOpcion(result.current.opciones[0], 3);
    });
    expect(result.current.opciones).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });
});

describe("useTarjetaImagenes · archivo real en las acciones", () => {
  it("no guarda en la Biblioteca sin archivo y lo explica", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => {
      await result.current.guardarEnBiblioteca(OPCION);
    });
    expect(h.guardarEnBiblioteca).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/antes de guardarla/);
  });

  it("guarda en la Biblioteca con título, URL y origen", async () => {
    h.guardarEnBiblioteca.mockResolvedValueOnce({ id: "recurso-1" });
    const { result } = renderHook(() => useTarjetaImagenes());
    const conArchivo = { ...OPCION, url: "https://img.ejemplo/uno.png" };
    let guardado: { id: string } | null = null;
    await act(async () => {
      guardado = await result.current.guardarEnBiblioteca(conArchivo);
    });
    expect(h.guardarEnBiblioteca).toHaveBeenCalledWith({
      kind: "image",
      title: `${SD.nombre} · Un faro al atardecer`,
      url: "https://img.ejemplo/uno.png",
      origin: SD.nombre
    });
    expect(guardado).toEqual({ id: "recurso-1" });
    expect(result.current.error).toBeNull();
  });

  it("usa la URL real como referencia 3D y no llama al taller sin archivo", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => {
      await result.current.usarComoReferencia3D(OPCION);
    });
    expect(h.usarComoReferencia3D).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/referencia para 3D/);

    await act(async () => {
      await result.current.usarComoReferencia3D({ ...OPCION, url: "https://img.ejemplo/uno.png" });
    });
    expect(h.usarComoReferencia3D).toHaveBeenCalledWith("https://img.ejemplo/uno.png");
  });

  it("prepara el borrador solo si hay archivo y ampliar devuelve la URL existente", async () => {
    h.borradorPublicacion.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => {
      await result.current.borradorPublicacion(OPCION);
    });
    expect(h.borradorPublicacion).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/borrador de publicación/);

    await act(async () => {
      await result.current.borradorPublicacion({ ...OPCION, url: "https://img.ejemplo/uno.png" });
    });
    expect(h.borradorPublicacion).toHaveBeenCalledTimes(1);

    let ampliada: string | null = null;
    await act(async () => {
      ampliada = await result.current.ampliar({ ...OPCION, url: "https://img.ejemplo/uno.png" });
    });
    expect(ampliada).toBe("https://img.ejemplo/uno.png");
  });

  it("expone el editor de la Protomolécula tal cual (lo abre la tarjeta con la URL)", () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    expect(result.current.abrirEnProtomolecula.abrirProtomoleculaEditor).toBe(h.abrirProtomoleculaEditor);
  });
});

describe("useTarjetaImagenes · planificar", () => {
  it("planifica, guarda el prompt y expone los descartes", async () => {
    const result = await montarConPlan();
    expect(h.planImagen).toHaveBeenCalledTimes(1);
    expect(result.current.opciones).toHaveLength(1);
    expect(result.current.opciones[0]).toMatchObject({ semilla: 123, prompt: PETICION.prompt, elegida: false });
    expect(result.current.descartes).toEqual(["Una neurona ocupada."]);
    expect(result.current.error).toBeNull();
    expect(result.current.cargando).toBe(false);
  });

  it("si el plan falla deja un error en español y no inventa opciones", async () => {
    h.planImagen.mockImplementationOnce(() => {
      throw new Error("No hay neuronas disponibles.");
    });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => {
      await result.current.generarOpciones(PETICION);
    });
    expect(result.current.opciones).toEqual([]);
    expect(result.current.error).toBe("No hay neuronas disponibles.");
    expect(result.current.cargando).toBe(false);
  });
});
