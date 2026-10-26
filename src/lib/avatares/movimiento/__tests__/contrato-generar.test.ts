// @vitest-environment jsdom
/**
 * Contrato del cuerpo hacia POST /api/movimiento/generar (Verificación 1026):
 * el motor enviaba {prompt, emocion, energia, duracionMs, bucle, nivel} y la
 * ruta exige {prompt, esqueleto, segundos, semilla?}; todo respondía 400 y la
 * vía Kimodo caía siempre al clip procedural. Aquí se prueba lo que envía hoy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: async () => ({}),
  capacidadesEnCache: () => null,
}));
import {
  moverAvatar,
  reiniciarFrenoKimodo,
  semillaDePrompt,
  generarClipProcedural,
  type Gesto,
  type MovimientoClip,
} from "../motor";

const CLIP: MovimientoClip = {
  esqueleto: "smplx22", fps: 30, duracionMs: 1000,
  rotaciones: [[0], [0]], raiz: [[0, 0, 0], [0, 0, 0]], origen: "kimodo",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reiniciarFrenoKimodo();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => CLIP }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); reiniciarFrenoKimodo(); });

/** Último cuerpo JSON que el motor mandó por fetch (vacío si no llamó). */
const cuerpoEnviado = (): Record<string, unknown> =>
  JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body ?? "{}"));

/**
 * Mueve con la vía «vivo» y devuelve el cuerpo enviado; cada prueba empieza
 * con el freno reiniciado, así que siempre hay exactamente una petición.
 */
const enviarConVivo = async (gesto: Gesto): Promise<Record<string, unknown>> => {
  await moverAvatar(gesto, { nivel: "vivo" });
  return cuerpoEnviado();
};

describe("contrato del cuerpo hacia /api/movimiento/generar", () => {
  it("con nivel «vivo» envía exactamente las cuatro claves del contrato", async () => {
    const cuerpo = await enviarConVivo({ prompt: "respirar lentamente" });
    expect(Object.keys(cuerpo).sort()).toEqual(["esqueleto", "prompt", "segundos", "semilla"]);
    expect(cuerpo.esqueleto).toBe("smplx22");
    expect(cuerpo.prompt).toBe("respirar lentamente");
  });

  it("duracionMs 200 queda por el suelo de 0,5 segundos", async () => {
    const cuerpo = await enviarConVivo({ prompt: "saludar", duracionMs: 200 });
    expect(cuerpo.segundos).toBe(0.5);
  });

  it("duracionMs 60000 queda por el techo de 10 segundos", async () => {
    const cuerpo = await enviarConVivo({ prompt: "caminar largo", duracionMs: 60000 });
    expect(cuerpo.segundos).toBe(10);
  });

  it("sin duracionMs envía los 2,4 segundos por defecto", async () => {
    const cuerpo = await enviarConVivo({ prompt: "girar despacio" });
    expect(cuerpo.segundos).toBe(2.4);
  });

  it("un prompt de 400 caracteres llega recortado a 300", async () => {
    const largo = "lento".repeat(80); // 400 caracteres exactos
    const cuerpo = await enviarConVivo({ prompt: largo });
    expect((cuerpo.prompt as string).length).toBe(300);
    expect(cuerpo.prompt).toBe(largo.slice(0, 300));
  });

  it("la semilla es un entero estable para el mismo prompt", async () => {
    const primera = await enviarConVivo({ prompt: "saludar con la mano", duracionMs: 2400 });
    // Otra duración: distinta clave de gesto, así que la caché no la sirve.
    const segunda = await enviarConVivo({ prompt: "saludar con la mano", duracionMs: 3000 });
    expect(segunda.semilla).toBe(primera.semilla);
    expect(Number.isInteger(primera.semilla)).toBe(true);
    expect(primera.semilla).toBe(semillaDePrompt("saludar con la mano"));
  });

  it("la semilla comparte función con el clip procedural", () => {
    const gesto = { prompt: "balanceo sereno" } as Gesto;
    const clipA = generarClipProcedural(gesto);
    const clipB = generarClipProcedural(gesto);
    expect(clipA.rotaciones).toEqual(clipB.rotaciones);
  });
});
