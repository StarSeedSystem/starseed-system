/** XR1010L · acciones del núcleo y adaptador `leerFuentes`. Node puro: sin hardware, red ni WebGL. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCIONES_XR, type AccionXR } from "../../../../lib/xr/vinculos-xr";
import { ejecutarAccion, leerFuentes, type ContextoAcciones } from "../acciones-xr";

function contexto(): ContextoAcciones {
  return {
    recentrar: vi.fn(), salir: vi.fn(async () => undefined), abrirMenuMano: vi.fn(), abrirDock: vi.fn(),
    hablar: vi.fn(), atras: vi.fn(), seleccionar: vi.fn(), agarrar: vi.fn(), teletransporte: vi.fn(), girar: vi.fn(),
  };
}

const CASOS: Array<[AccionXR, keyof ContextoAcciones, unknown[]]> = [
  ["seleccionar", "seleccionar", []], ["agarrar", "agarrar", [true]], ["menu-mano", "abrirMenuMano", []],
  ["abrir-dock", "abrirDock", []], ["recentrar", "recentrar", []], ["salir", "salir", []],
  ["hablar", "hablar", [true]], ["teletransporte", "teletransporte", []],
  ["giro-izquierda", "girar", [-1]], ["giro-derecha", "girar", [1]], ["atras", "atras", []],
];

afterEach(() => { vi.restoreAllMocks(); });

describe("ejecutarAccion", () => {
  it("cubre exactamente las 11 acciones del núcleo", () => {
    expect(new Set(CASOS.map(([accion]) => accion))).toEqual(new Set(ACCIONES_XR));
    expect(CASOS).toHaveLength(11);
  });

  it.each(CASOS)("«%s» llega a %s con sus argumentos", (accion, metodo, argumentos) => {
    const ctx = contexto();
    ejecutarAccion(accion, ctx);
    expect(ctx[metodo]).toHaveBeenCalledTimes(1);
    expect(ctx[metodo]).toHaveBeenCalledWith(...argumentos);
  });

  it("agarrar y hablar distinguen pulsar de soltar", () => {
    const ctx = contexto();
    ejecutarAccion("agarrar", ctx, false);
    ejecutarAccion("hablar", ctx, false);
    expect(ctx.agarrar).toHaveBeenCalledWith(false);
    expect(ctx.hablar).toHaveBeenCalledWith(false);
  });

  it("salir llega aunque otro callback lance, y el fallo se registra sin romper", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = contexto();
    const atras = vi.fn(() => { throw new Error("atrás roto"); });
    const conFallo: ContextoAcciones = { ...ctx, atras };
    expect(() => ejecutarAccion("atras", conFallo)).not.toThrow();
    ejecutarAccion("salir", conFallo);
    expect(ctx.salir).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("un rechazo de salir se captura y también se registra", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = contexto();
    vi.mocked(ctx.salir).mockRejectedValueOnce(new Error("sin sesión"));
    expect(() => ejecutarAccion("salir", ctx)).not.toThrow();
    await Promise.resolve();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("leerFuentes", () => {
  it("Quest: mando izquierdo y derecho se leen por handedness, no por índice", () => {
    const lecturas = leerFuentes({
      inputSources: [
        { handedness: "right", targetRayMode: "tracked-pointer", gamepad: { buttons: [{ pressed: true, value: 1 }], axes: [0, 0, 0.8, 0] } },
        { handedness: "left", targetRayMode: "tracked-pointer", gamepad: { buttons: [{ pressed: false, value: 0 }], axes: [0, 0, -0.2, 0] } },
      ],
    });
    expect(lecturas).toHaveLength(2);
    expect(lecturas.map((l) => l.mano)).toEqual(["derecha", "izquierda"]);
    expect(lecturas[0]).toMatchObject({ modo: "tracked-pointer", esMano: false, botones: [true], ejes: [0, 0, 0.8, 0] });
    expect(lecturas[1].botones).toEqual([false]);
  });

  it("Vision Pro: transient-pointer con mano, articulaciones resueltas y sin gamepad", () => {
    const junta = { tipo: "junta" };
    const lecturas = leerFuentes(
      { inputSources: [{ handedness: "right", targetRayMode: "transient-pointer", hand: new Map([["index-finger-tip", junta]]) }] },
      (valor) => (valor === junta ? [0.1, 0.2, 0.3] : null),
    );
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]).toMatchObject({ mano: "derecha", modo: "transient-pointer", esMano: true, botones: [], ejes: [] });
    expect(lecturas[0].articulaciones["index-finger-tip"]).toEqual([0.1, 0.2, 0.3]);
  });

  it("móvil: screen sin índices fijos y sin mano", () => {
    const lecturas = leerFuentes({ inputSources: [{ targetRayMode: "screen", gamepad: { buttons: [{ value: 0.7 }], axes: [0.5] } }] });
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]).toMatchObject({ mano: "cualquiera", modo: "screen", esMano: false, botones: [true], ejes: [0.5] });
  });

  it("una entrada ausente o incompleta no rompe: lista vacía y lectura coherente", () => {
    expect(leerFuentes(null)).toEqual([]);
    expect(leerFuentes(undefined)).toEqual([]);
    expect(leerFuentes({})).toEqual([]);
    expect(leerFuentes({ inputSources: [] })).toEqual([]);
    const [rota] = leerFuentes({ inputSources: [{}] });
    expect(rota).toMatchObject({ mano: "cualquiera", modo: "desconocido", esMano: false, botones: [], ejes: [] });
  });

  it("un targetRayMode desconocido se marca como tal y los ejes no finitos valen 0", () => {
    const [lectura] = leerFuentes({ inputSources: [{ targetRayMode: "holograma", gamepad: { axes: [Number.NaN, 0.4] } }] });
    expect(lectura.modo).toBe("desconocido");
    expect(lectura.ejes).toEqual([0, 0.4]);
  });

  it("gaze y una mano suelta también producen lecturas sin lanzar", () => {
    const lecturas = leerFuentes({ inputSources: [{ targetRayMode: "gaze" }, { targetRayMode: "tracked-pointer", hand: {} }] });
    expect(lecturas.map((l) => l.modo)).toEqual(["gaze", "tracked-pointer"]);
    expect(lecturas[1].esMano).toBe(true);
    expect(lecturas[1].articulaciones).toEqual({});
  });
});
