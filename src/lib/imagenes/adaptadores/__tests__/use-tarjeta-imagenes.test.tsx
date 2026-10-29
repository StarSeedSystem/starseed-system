// @vitest-environment jsdom
/**
 * useTarjetaImagenes (IMG1011C-parte 2): pruebas del hook y de sus funciones puras exportadas.
 * Sin red: las dependencias de archivo/red se destacan con módulos falsos, como en el resto del repo.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpcionImagen } from "../../plan";
import {
  atribucionDe, opcionesConPrompt, semillasNuevas, urlDeResultado,
  useTarjetaImagenes, PETICION_DEFECTO, type OpcionTarjeta,
} from "../use-tarjeta-imagenes";
import { MODELOS_IMAGEN } from "../../modelos";

const h = vi.hoisted(() => ({
  planImagen: { planImagen: vi.fn() },
  generarImagen: { generarImagen: vi.fn() },
  guardarEnBiblioteca: { guardarEnBiblioteca: vi.fn() },
  referencia3d: { usarComoReferencia3D: vi.fn() },
  protomolecula: { abrirEnProtomolecula: { abrirProtomoleculaEditor: vi.fn() } },
  borrador: { borradorPublicacion: vi.fn() },
  malla: { useMallaNeuronasEstado: vi.fn(() => ({ misDispositivos: [] })) },
}));

vi.mock("../../plan", () => h.planImagen);
vi.mock("@/lib/aurora/generate/service-generation", () => h.generarImagen);
vi.mock("@/lib/library", () => h.guardarEnBiblioteca);
vi.mock("@/lib/avatares/referencia3d", () => h.referencia3d);
vi.mock("@/lib/protomolecula/editor", () => h.protomolecula);
vi.mock("@/lib/publicacion/borrador", () => h.borrador);
vi.mock("@/lib/network/malla-neuronas", () => h.malla);

const prompt = "Un gondoliado de abanico con cráneo de piruleta";
const sd15 = MODELOS_IMAGEN.find((m) => m.id === "sd15")!;
const sdxl = MODELOS_IMAGEN.find((m) => m.id === "sdxl")!;

const opcionDePlan: OpcionImagen = {
  capa: "dispositivo", modelo: sd15, motor: "sdcpp", cuantizacion: "q4",
  semilla: 123, motivo: "Corre en CPU.",
};
const opcionConUrl = (extra: Partial<OpcionTarjeta> = {}): OpcionTarjeta => ({
  ...opcionDePlan, prompt: "algo", url: "data:image/png;base64,abc", ...extra,
});

describe("funciones puras de la tarjeta", () => {
  it("atribucionDe: modelo, licencia y repositorio visibles; sin modelo, honesto", () => {
    expect(atribucionDe({ modelo: sd15 })).toBe(
      `${sd15.nombre} · licencia: ${sd15.licencia} · repositorio: https://huggingface.co/${sd15.hf}`);
    expect(atribucionDe({ modelo: null })).toBe("Modelo a decidir por el plan");
  });

  it("urlDeResultado: saca data.url y no inventa nada con resultados vacíos o raros", () => {
    expect(urlDeResultado({ ok: true, data: { url: "https://a.com/x.png" } })).toBe("https://a.com/x.png");
    expect(urlDeResultado({ ok: true, message: "sin archivo" })).toBeNull();
    expect(urlDeResultado(null)).toBeNull();
    expect(urlDeResultado({ ok: true, data: { url: "   " } })).toBeNull();
  });

  it("opcionesConPrompt: pega el prompt a cada opción sin tocar las demás propiedades", () => {
    const [a, b] = [opcionDePlan, { ...opcionDePlan, semilla: 999 }];
    const pegadas = opcionesConPrompt([a, b], prompt);
    expect(pegadas.map((o) => o.prompt)).toEqual([prompt, prompt]);
    expect(pegadas[0]?.modelo).toBe(sd15);
    expect(pegadas[0]?.semilla).toBe(123);
  });

  it("semillasNuevas: descarta las (modelo, semilla) que ya estaban y guarda el resto", () => {
    const nuevas = [
      { ...opcionDePlan },                                  // repetida
      { ...opcionDePlan, semilla: 124 },                    // nueva semilla
      { ...opcionDePlan, modelo: sdxl, semilla: 123 },      // otro modelo, misma semilla
    ];
    const deVerdad = semillasNuevas([opcionDePlan], nuevas);
    expect(deVerdad).toHaveLength(2);
    expect(deVerdad.some((o) => o.modelo?.id === sdxl.id)).toBe(true);
    expect(semillasNuevas(opcionesConPrompt([opcionDePlan], "x"), [{ ...opcionDePlan }])).toHaveLength(0);
  });
});

describe("hook useTarjetaImagenes", () => {
  beforeEach(() => {
    h.planImagen.planImagen.mockReset();
    h.generarImagen.generarImagen.mockReset();
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockReset();
    h.referencia3d.usarComoReferencia3D.mockReset();
    h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor.mockReset();
    h.borrador.borradorPublicacion.mockReset();
  });
  afterEach(cleanup);

  it("generarOpciones: pega el prompt a las opciones del plan y no deja error", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    expect(result.current.opciones).toHaveLength(1);
    expect(result.current.opciones[0]?.prompt).toBe(prompt);
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("generarOpciones: la petición a medias se completa con PETICION_DEFECTO (aplicado, no adorno)", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ prompt }); });
    const pedida = h.planImagen.planImagen.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(pedida).toMatchObject(PETICION_DEFECTO);
    expect(pedida.prompt).toBe(prompt);
    expect(result.current.opciones).toHaveLength(1);
    // y «variar» repite la petición completa guardada, con esa base de PETICION_DEFECTO
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    await act(async () => {
      result.current.variarOpcion(result.current.opciones[0]!);
    });
    const repetida = h.planImagen.planImagen.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(repetida).toMatchObject(PETICION_DEFECTO);
  });

  it("elegirOpcion: genera, marca la opción con su URL y guarda en Biblioteca con la atribución", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    h.generarImagen.generarImagen.mockResolvedValueOnce({ ok: true, data: { url: "http://e.com/i.png" } });
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockResolvedValueOnce({ id: "1" });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    let url: string | null = null;
    await act(async () => {
      url = (await result.current.elegirOpcion({ ...result.current.opciones[0]!, prompt })) as string | null;
    });
    expect(url).toBe("http://e.com/i.png");
    expect(h.generarImagen.generarImagen).toHaveBeenCalledWith(prompt);
    expect(result.current.opciones[0]).toMatchObject({ url: "http://e.com/i.png", elegida: true });
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).toHaveBeenCalledTimes(1);
    const guardado = h.guardarEnBiblioteca.guardarEnBiblioteca.mock.calls[0]?.[0] as Record<string, string>;
    expect(guardado.kind).toBe("image");
    expect(guardado.origin).toContain(sd15.nombre);
    expect(guardado.origin).toContain(sd15.licencia);
  });

  it("elegirOpcion: sin archivo del motor, avisa y NO guarda nada en la Biblioteca", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    h.generarImagen.generarImagen.mockResolvedValueOnce({ ok: true, message: "sin archivo" });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    await act(async () => { await result.current.elegirOpcion(result.current.opciones[0]!); });
    expect(result.current.error).toContain("No salió archivo");
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).not.toHaveBeenCalled();
  });

  it("variarOpcion: replanifica con solo ese modelo y añade SOLO semillas nuevas", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    h.planImagen.planImagen.mockReturnValueOnce({
      opciones: [opcionDePlan, { ...opcionDePlan, semilla: 124 }], descartes: [],
    });
    let variadas: OpcionTarjeta[] = [];
    await act(async () => { variadas = result.current.variarOpcion(result.current.opciones[0]!); });
    expect(h.planImagen.planImagen).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), [sd15]);
    expect(variadas).toHaveLength(1);
    expect(result.current.opciones).toHaveLength(2);
    expect(result.current.error).toBeNull();
    // y si el plan solo repite lo que ya hay: aviso honesto y nada colgado
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    await act(async () => { variadas = result.current.variarOpcion(result.current.opciones[0]!); });
    expect(variadas).toHaveLength(0);
    expect(result.current.error).toContain(`semillas distintas de ${sd15.nombre}`);
  });

  it("editarProtomolecula: con URL abre el editor; sin URL avisa y no lo toca", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor(opcionConUrl()); });
    expect(h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor).toHaveBeenCalledWith("data:image/png;base64,abc");
    h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor.mockClear();
    await act(async () => { await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor({ ...opcionConUrl(), url: undefined }); });
    expect(result.current.error).toContain("Primero elige la opción");
    expect(h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor).not.toHaveBeenCalled();
  });

  it("ampliar: devuelve la URL de la imagen; sin imagen avisa y devuelve null", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    let grande: string | null = null;
    act(() => { grande = result.current.ampliar(opcionConUrl()) as string | null; });
    expect(grande).toBe("data:image/png;base64,abc");
    let noGrande: string | null = null;
    act(() => { noGrande = result.current.ampliar({ ...opcionConUrl(), url: undefined }) as string | null; });
    expect(noGrande).toBeNull();
    expect(result.current.error).toContain("aún no tiene imagen");
  });

  it("usarComoReferencia3D: toma la URL ya generada; sin imagen avisa", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.usarComoReferencia3D(opcionConUrl()); });
    expect(h.referencia3d.usarComoReferencia3D).toHaveBeenCalledWith("data:image/png;base64,abc");
    await act(async () => { await result.current.usarComoReferencia3D({ ...opcionConUrl(), url: undefined }); });
    expect(result.current.error).toContain("Sin imagen generada");
    expect(h.referencia3d.usarComoReferencia3D).toHaveBeenCalledTimes(1);
  });

  it("guardarEnBiblioteca y borradorPublicacion: solo con imagen ya generada", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.guardarEnBiblioteca({ ...opcionConUrl(), url: undefined }); });
    expect(result.current.error).toContain("elige primero");
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).not.toHaveBeenCalled();
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockResolvedValueOnce({ id: "2" });
    const captura: Array<{ id: string } | null> = [];
    await act(async () => { captura.push(await result.current.guardarEnBiblioteca(opcionConUrl()) as { id: string } | null); });
    expect(captura[0]?.id).toBe("2");

    await act(async () => { await result.current.borradorPublicacion({ ...opcionConUrl(), url: undefined }); });
    expect(result.current.error).toContain("borrador necesita una imagen");
    expect(h.borrador.borradorPublicacion).not.toHaveBeenCalled();
    await act(async () => { await result.current.borradorPublicacion(opcionConUrl()); });
    expect(h.borrador.borradorPublicacion).toHaveBeenCalledTimes(1);
  });

  it("de la malla a la planificación: las neuronas que llega de la malla son las que el plan ve (capa y motor honestos)", async () => {
    h.malla.useMallaNeuronasEstado.mockReturnValueOnce({
      misDispositivos: [{ neuronId: "n-aparato", esEsteDispositivo: true, instalados: ["pollinations"] }, { neuronId: "n-remota", esEsteDispositivo: false }],
    });
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    const [peticion, neuronas] = h.planImagen.planImagen.mock.calls[0] as unknown as [Record<string, unknown>, Array<Record<string, unknown>>];
    expect(neuronas.map((n) => `${n.id}:${n.capa}`).sort()).toEqual(["n-aparato:dispositivo", "n-remota:neurona"]);
    expect(peticion.opciones).toBe(PETICION_DEFECTO.opciones);
  });
});

describe("caminos de error: cada aviso es honesto y nunca guarda a medias", () => {
  beforeEach(() => {
    h.planImagen.planImagen.mockReset();
    h.generarImagen.generarImagen.mockReset();
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockReset();
    h.referencia3d.usarComoReferencia3D.mockReset();
    h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor.mockReset();
    h.borrador.borradorPublicacion.mockReset();
  });
  afterEach(cleanup);

  it("generarOpciones: si el plan falla, avisa y la tarjeta queda vacía, sin opciones fantasma", async () => {
    h.planImagen.planImagen.mockImplementationOnce(() => { throw new Error("catálogo roto"); });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    expect(result.current.error).toContain("catálogo roto"); // el mensaje real hace troubleshooting, no el genérico
    expect(result.current.opciones).toHaveLength(0);
    expect(result.current.cargando).toBe(false);
  });

  it("elegirOpcion: motor caído → avisa, no marca la opción y no guarda en la Biblioteca", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    h.generarImagen.generarImagen.mockRejectedValueOnce(new Error("Pollinations saturado"));
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    await act(async () => { await result.current.elegirOpcion(result.current.opciones[0]!); });
    expect(result.current.error).toContain("Pollinations saturado"); // el motivo real, no un genérico
    expect(result.current.opciones[0]).not.toHaveProperty("elegida", true);
    expect(result.current.opciones[0]).not.toHaveProperty("url");
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).not.toHaveBeenCalled();
    expect(result.current.cargando).toBe(false);
  });

  it("elegirOpcion: opción sin prompt (no salió del plan) → aviso claro y ni una llamada al motor", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.elegirOpcion({ ...opcionDePlan }); });
    expect(result.current.error).toContain("no lleva prompt");
    expect(h.generarImagen.generarImagen).not.toHaveBeenCalled();
    expect(h.guardarEnBiblioteca.guardarEnBiblioteca).not.toHaveBeenCalled();
  });

  it("variarOpcion: opción sin modelo identificado → aviso constante: no hay plan y no hay semillas", async () => {
    const { result } = renderHook(() => useTarjetaImagenes());
    let variadas: OpcionTarjeta[] = [];
    await act(async () => { variadas = result.current.variarOpcion({ ...opcionDePlan, modelo: null }); });
    expect(variadas).toHaveLength(0);
    expect(result.current.error).toContain("No sé qué modelo variar");
    expect(h.planImagen.planImagen).not.toHaveBeenCalled();
  });

  it("editarProtomolecula: si el editor falla, el aviso es el del editor y no se traga", async () => {
    h.protomolecula.abrirEnProtomolecula.abrirProtomoleculaEditor.mockRejectedValueOnce(new Error("lienzo ocupado"));
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.abrirEnProtomolecula.abrirProtomoleculaEditor(opcionConUrl()); });
    expect(result.current.error).toContain("lienzo ocupado");
  });

  it("guardarEnBiblioteca: si la Biblioteca rechaza, devuelve null y avisa (nunca finge que guardó)", async () => {
    h.guardarEnBiblioteca.guardarEnBiblioteca.mockRejectedValueOnce(new Error("cuota llena"));
    const { result } = renderHook(() => useTarjetaImagenes());
    let guardado: { id: string } | null = null;
    await act(async () => { guardado = await result.current.guardarEnBiblioteca(opcionConUrl()) as { id: string } | null; });
    expect(guardado).toBeNull();
    expect(result.current.error).toContain("cuota llena");
  });

  it("usarComoReferencia3D y borradorPublicacion: su fallo sale como error y no como silencio", async () => {
    h.referencia3d.usarComoReferencia3D.mockRejectedValueOnce(new Error("taller cerrado"));
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.usarComoReferencia3D(opcionConUrl()); });
    expect(result.current.error).toContain("taller cerrado");

    h.borrador.borradorPublicacion.mockRejectedValueOnce(new Error("sin canal de publicación"));
    await act(async () => { await result.current.borradorPublicacion(opcionConUrl()); });
    expect(result.current.error).toContain("sin canal de publicación");
  });

  it("un error viejo no vive para siempre: la operación nueva que sale bien lo limpia", async () => {
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan], descartes: [] });
    const { result } = renderHook(() => useTarjetaImagenes());
    await act(async () => { await result.current.generarOpciones({ ...PETICION_DEFECTO, prompt }); });
    act(() => { result.current.ampliar({ ...opcionConUrl(), url: undefined }); });
    expect(result.current.error).toContain("aún no tiene imagen");
    h.planImagen.planImagen.mockReturnValueOnce({ opciones: [opcionDePlan, { ...opcionDePlan, semilla: 124 }], descartes: [] });
    await act(async () => { result.current.variarOpcion(result.current.opciones[0]!); });
    expect(result.current.error).toBeNull();
    expect(result.current.opciones).toHaveLength(2);
  });
});
