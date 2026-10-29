// @vitest-environment jsdom
/**
 * useTarjetaImagenes (IMG1011Cc-d3): pruebas del hook y de sus funciones puras exportadas.
 * Todo se sustituye por dobles en memoria: ni red, ni disco, ni GPU.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpcionImagen } from "../../plan";
import { MODELOS_IMAGEN } from "../../modelos";
import {
  PETICION_DEFECTO,
  atribucionDe,
  opcionesConPrompt,
  semillasNuevas,
  urlDeResultado,
  useTarjetaImagenes,
  type OpcionTarjeta,
} from "../use-tarjeta-imagenes";

const dobles = vi.hoisted(() => ({
  planImagen: vi.fn(),
  generarImagen: vi.fn(),
  guardarEnBiblioteca: vi.fn(),
  usarComoReferencia3D: vi.fn(),
  abrirProtomoleculaEditor: vi.fn(),
  borradorPublicacion: vi.fn(),
  useMallaNeuronasEstado: vi.fn(),
}));

vi.mock("../../plan", () => ({ planImagen: dobles.planImagen }));
vi.mock("@/lib/aurora/generate/service-generation", () => ({ generarImagen: dobles.generarImagen }));
vi.mock("@/lib/library", () => ({ guardarEnBiblioteca: dobles.guardarEnBiblioteca }));
vi.mock("@/lib/avatares/referencia3d", () => ({ usarComoReferencia3D: dobles.usarComoReferencia3D }));
vi.mock("@/lib/protomolecula/editor", () => ({
  abrirEnProtomolecula: { abrirProtomoleculaEditor: dobles.abrirProtomoleculaEditor },
}));
vi.mock("@/lib/publicacion/borrador", () => ({ borradorPublicacion: dobles.borradorPublicacion }));
vi.mock("@/lib/network/malla-neuronas", () => ({
  useMallaNeuronasEstado: dobles.useMallaNeuronasEstado,
}));

const prompt = "Un faro de papel sobre el mar de nubes";
const sd15 = MODELOS_IMAGEN.find((m) => m.id === "sd15")!;
const sdxl = MODELOS_IMAGEN.find((m) => m.id === "sdxl")!;

const opcionPlan: OpcionImagen = {
  capa: "dispositivo",
  modelo: sd15,
  motor: "sdcpp",
  cuantizacion: "q4",
  semilla: 41,
  motivo: "Corre en CPU.",
};

const conUrl = (extra: Partial<OpcionTarjeta> = {}): OpcionTarjeta => ({
  ...opcionPlan,
  prompt,
  url: "data:image/png;base64,Zm90bw==",
  ...extra,
});

describe("funciones puras de la tarjeta", () => {
  it("atribucionDe: modelo, licencia y repositorio visibles; sin modelo, lo dice", () => {
    expect(atribucionDe({ modelo: sd15 })).toBe(
      `${sd15.nombre} · licencia: ${sd15.licencia} · repositorio: https://huggingface.co/${sd15.hf}`,
    );
    expect(atribucionDe({ modelo: null })).toBe("Modelo a decidir por el plan");
  });

  it("urlDeResultado: solo acepta una URL de texto no vacía", () => {
    expect(urlDeResultado({ ok: true, data: { url: "https://a.test/x.png" } })).toBe("https://a.test/x.png");
    expect(urlDeResultado({ ok: false, data: { url: "https://a.test/x.png" } })).toBe("https://a.test/x.png");
    expect(urlDeResultado({ ok: true, data: { url: "   " } })).toBeNull();
    expect(urlDeResultado({ ok: true, data: { url: 42 } })).toBeNull();
    expect(urlDeResultado({ ok: true, data: "texto" })).toBeNull();
    expect(urlDeResultado({ ok: true, message: "sin archivo" })).toBeNull();
    expect(urlDeResultado(null)).toBeNull();
    expect(urlDeResultado(undefined)).toBeNull();
  });

  it("opcionesConPrompt: pega el prompt sin tocar modelo, semilla ni motivo", () => {
    const otra = { ...opcionPlan, semilla: 999 };
    const pegadas = opcionesConPrompt([opcionPlan, otra], prompt);
    expect(pegadas.map((o) => o.prompt)).toEqual([prompt, prompt]);
    expect(pegadas[0]?.modelo).toBe(sd15);
    expect(pegadas[0]?.semilla).toBe(41);
    expect(pegadas[1]?.semilla).toBe(999);
    expect(opcionPlan).not.toHaveProperty("prompt");
  });

  it("semillasNuevas: compara modelo y semilla, también cuando no hay modelo", () => {
    const nuevas = [
      { ...opcionPlan },
      { ...opcionPlan, semilla: 42 },
      { ...opcionPlan, modelo: sdxl, semilla: 41 },
    ];
    const distintas = semillasNuevas([opcionPlan], nuevas);
    expect(distintas.map((o) => `${o.modelo?.id ?? "sin"}#${o.semilla}`)).toEqual([
      `${sd15.id}#42`,
      `${sdxl.id}#41`,
    ]);

    const sinModelo = { ...opcionPlan, modelo: null };
    expect(semillasNuevas([sinModelo], [{ ...sinModelo }])).toHaveLength(0);
    expect(semillasNuevas([], [{ ...sinModelo }])).toHaveLength(1);
  });
});

describe("hook useTarjetaImagenes", () => {
  beforeEach(() => {
    dobles.planImagen.mockReset();
    dobles.generarImagen.mockReset();
    dobles.guardarEnBiblioteca.mockReset();
    dobles.usarComoReferencia3D.mockReset();
    dobles.abrirProtomoleculaEditor.mockReset();
    dobles.borradorPublicacion.mockReset();
    dobles.useMallaNeuronasEstado.mockReset();
    dobles.useMallaNeuronasEstado.mockReturnValue({ misDispositivos: [] });
  });
  afterEach(cleanup);

  it("generarOpciones: completa la petición y pasa a planImagen las neuronas de la malla", async () => {
    dobles.useMallaNeuronasEstado.mockReturnValue({
      misDispositivos: [{ neuronId: "n-casa", esEsteDispositivo: true, instalados: ["sd15"] }],
    });
    dobles.planImagen.mockReturnValueOnce({ opciones: [opcionPlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.generarOpciones({ prompt }); });

    const [peticion, neuronas] = dobles.planImagen.mock.calls[0]!;
    expect(peticion).toMatchObject(PETICION_DEFECTO);
    expect(peticion.prompt).toBe(prompt);
    expect(neuronas).toEqual([
      {
        id: "n-casa",
        capa: "dispositivo",
        gpu: "ninguna",
        vramGB: null,
        ramLibreGB: 8,
        motores: ["sdcpp", "onnx-web"],
        instalados: ["sd15"],
        ocupada: false,
        medidas: {},
      },
    ]);
    expect(dobles.planImagen.mock.calls[0]?.[3]).toBe(MODELOS_IMAGEN);
    expect(result.current.opciones).toEqual([{ ...opcionPlan, prompt }]);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("generarOpciones: si el plan falla, deja el error a la vista y no se queda cargando", async () => {
    dobles.planImagen.mockImplementationOnce(() => { throw new Error("no hay neuronas libres"); });
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.generarOpciones({ prompt }); });

    expect(result.current.error).toBe("no hay neuronas libres");
    expect(result.current.cargando).toBe(false);
    expect(result.current.opciones).toEqual([]);
  });

  it("variarOpcion: sin modelo identificado no inventa semillas ni llama al plan", () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    let nuevas: OpcionTarjeta[] = [];

    act(() => { nuevas = result.current.variarOpcion({ ...conUrl(), modelo: null }); });

    expect(nuevas).toEqual([]);
    expect(result.current.error).toContain("No sé qué modelo variar");
    expect(dobles.planImagen).not.toHaveBeenCalled();
  });

  it("variarOpcion: replanifica con solo ese modelo y añade las semillas que faltan", async () => {
    dobles.planImagen.mockReturnValueOnce({ opciones: [opcionPlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ prompt }); });

    dobles.planImagen.mockReturnValueOnce({
      opciones: [opcionPlan, { ...opcionPlan, semilla: 42 }],
      descartes: [],
    });
    let nuevas: OpcionTarjeta[] = [];
    await act(async () => { nuevas = result.current.variarOpcion(result.current.opciones[0]!); });

    expect(dobles.planImagen).toHaveBeenLastCalledWith(
      expect.objectContaining(PETICION_DEFECTO),
      expect.any(Array),
      expect.any(Number),
      [sd15],
    );
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0]).toMatchObject({ semilla: 42, prompt });
    expect(result.current.opciones.map((o) => o.semilla)).toEqual([41, 42]);
    expect(result.current.error).toBeNull();
  });

  it("elegirOpcion: sin prompt avisa y no llama al generador", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    let url: string | null = "sin-tocar";

    await act(async () => { url = await result.current.elegirOpcion({ ...conUrl(), prompt: undefined }); });

    expect(url).toBeNull();
    expect(result.current.error).toContain("no lleva prompt");
    expect(dobles.generarImagen).not.toHaveBeenCalled();
  });

  it("elegirOpcion: guarda la URL, marca la elegida y deja la atribución en la Biblioteca", async () => {
    dobles.planImagen.mockReturnValueOnce({ opciones: [opcionPlan], descartes: [] });
    dobles.generarImagen.mockResolvedValueOnce({ ok: true, data: { url: "https://e.test/i.png" } });
    dobles.guardarEnBiblioteca.mockResolvedValueOnce({ id: "img-1" });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ prompt }); });

    let url: string | null = null;
    await act(async () => { url = await result.current.elegirOpcion(result.current.opciones[0]!); });

    expect(url).toBe("https://e.test/i.png");
    expect(dobles.generarImagen).toHaveBeenCalledWith(prompt);
    expect(result.current.opciones[0]).toMatchObject({ url: "https://e.test/i.png", elegida: true });
    expect(dobles.guardarEnBiblioteca).toHaveBeenCalledTimes(1);
    expect(dobles.guardarEnBiblioteca).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image",
        url: "https://e.test/i.png",
        origin: expect.stringContaining(`licencia: ${sd15.licencia}`),
      }),
    );
    expect(result.current.cargando).toBe(false);
  });

  it("elegirOpcion: sin archivo del motor avisa y NO guarda nada", async () => {
    dobles.planImagen.mockReturnValueOnce({ opciones: [opcionPlan], descartes: [] });
    dobles.generarImagen.mockResolvedValueOnce({ ok: true, message: "sin archivo" });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ prompt }); });

    await act(async () => { await result.current.elegirOpcion(result.current.opciones[0]!); });

    expect(result.current.error).toContain("No salió archivo");
    expect(result.current.opciones[0]?.url).toBeUndefined();
    expect(dobles.guardarEnBiblioteca).not.toHaveBeenCalled();
  });

  it("elegirOpcion: si el generador lanza, lo cuenta y no guarda", async () => {
    dobles.planImagen.mockReturnValueOnce({ opciones: [opcionPlan], descartes: [] });
    dobles.generarImagen.mockRejectedValueOnce(new Error("cuota agotada"));
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ prompt }); });

    let url: string | null = "sin-tocar";
    await act(async () => { url = await result.current.elegirOpcion(result.current.opciones[0]!); });

    expect(url).toBeNull();
    expect(result.current.error).toBe("cuota agotada");
    expect(dobles.guardarEnBiblioteca).not.toHaveBeenCalled();
    expect(result.current.cargando).toBe(false);
  });

  it("editar en la Protomolécula: con URL abre el editor; sin URL avisa y no lo toca", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => {
      await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor(conUrl());
    });
    expect(dobles.abrirProtomoleculaEditor).toHaveBeenCalledWith("data:image/png;base64,Zm90bw==");

    dobles.abrirProtomoleculaEditor.mockClear();
    await act(async () => {
      await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor(conUrl({ url: undefined }));
    });
    expect(result.current.error).toContain("Primero elige la opción");
    expect(dobles.abrirProtomoleculaEditor).not.toHaveBeenCalled();
  });

  it("editar en la Protomolécula: si el editor falla, el error queda a la vista", async () => {
    dobles.abrirProtomoleculaEditor.mockRejectedValueOnce(new Error("lienzo ocupado"));
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => {
      await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor(conUrl());
    });

    expect(result.current.error).toBe("lienzo ocupado");
  });

  it("ampliar: devuelve la URL de la imagen; sin imagen avisa y devuelve null", () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    let grande: string | null = null;
    let ninguna: string | null = "sin-tocar";

    act(() => { grande = result.current.ampliar(conUrl()); });
    act(() => { ninguna = result.current.ampliar(conUrl({ url: undefined })); });

    expect(grande).toBe("data:image/png;base64,Zm90bw==");
    expect(ninguna).toBeNull();
    expect(result.current.error).toContain("aún no tiene imagen");
  });

  it("usar como referencia 3D: pasa la URL ya generada; sin imagen avisa y no la envía", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.usarComoReferencia3D(conUrl()); });
    expect(dobles.usarComoReferencia3D).toHaveBeenCalledWith("data:image/png;base64,Zm90bw==");

    await act(async () => { await result.current.usarComoReferencia3D(conUrl({ url: undefined })); });
    expect(result.current.error).toContain("Sin imagen generada");
    expect(dobles.usarComoReferencia3D).toHaveBeenCalledTimes(1);
  });

  it("usar como referencia 3D: si el taller falla, lo cuenta sin romper la tarjeta", async () => {
    dobles.usarComoReferencia3D.mockRejectedValueOnce(new Error("taller 3D apagado"));
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.usarComoReferencia3D(conUrl()); });

    expect(result.current.error).toBe("taller 3D apagado");
  });

  it("guardar en la Biblioteca: exige imagen y devuelve el id guardado", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.guardarEnBiblioteca(conUrl({ url: undefined })); });
    expect(result.current.error).toContain("elige primero");
    expect(dobles.guardarEnBiblioteca).not.toHaveBeenCalled();

    dobles.guardarEnBiblioteca.mockResolvedValueOnce({ id: "guardada-2" });
    let guardada: { id: string } | null = null;
    await act(async () => { guardada = await result.current.guardarEnBiblioteca(conUrl()); });

    expect(guardada).toEqual({ id: "guardada-2" });
    expect(dobles.guardarEnBiblioteca).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", origin: expect.stringContaining(sd15.nombre) }),
    );
  });

  it("guardar en la Biblioteca: si falla, lo cuenta y devuelve null", async () => {
    dobles.guardarEnBiblioteca.mockRejectedValueOnce(new Error("sin espacio"));
    const { result } = renderHook(() => useTarjetaImagenes());

    let guardada: { id: string } | null = { id: "sin-tocar" };
    await act(async () => { guardada = await result.current.guardarEnBiblioteca(conUrl()); });

    expect(guardada).toBeNull();
    expect(result.current.error).toBe("sin espacio");
  });

  it("borrador de publicación: exige imagen y lo crea una sola vez", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.borradorPublicacion(conUrl({ url: undefined })); });
    expect(result.current.error).toContain("borrador necesita una imagen");
    expect(dobles.borradorPublicacion).not.toHaveBeenCalled();

    await act(async () => { await result.current.borradorPublicacion(conUrl()); });
    expect(dobles.borradorPublicacion).toHaveBeenCalledTimes(1);
  });

  it("borrador de publicación: si falla, lo cuenta", async () => {
    dobles.borradorPublicacion.mockRejectedValueOnce(new Error("borrador bloqueado"));
    const { result } = renderHook(() => useTarjetaImagenes());

    await act(async () => { await result.current.borradorPublicacion(conUrl()); });

    expect(result.current.error).toBe("borrador bloqueado");
  });
});
