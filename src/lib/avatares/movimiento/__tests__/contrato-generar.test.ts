// @vitest-environment jsdom
/**
 * Contrato del cuerpo a /api/movimiento/generar (verificación 1026): el motor
 * manda exactamente { prompt, esqueleto, segundos, semilla } como exige la
 * ruta; con eso los niveles «vivo» y «fluido» dejan de caer siempre a 400.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: async () => ({}),
  capacidadesEnCache: () => null,
}));
import {
  moverAvatar,
  reiniciarFrenoKimodo,
  semillaDelPrompt,
  type MovimientoClip,
} from "../motor";

const CLIP: MovimientoClip = {
  esqueleto: "smplx22",
  fps: 30,
  duracionMs: 2400,
  rotaciones: [[0], [0]],
  raiz: [[0, 0, 0], [0, 0, 0]],
  origen: "kimodo",
};

const ok = () => ({ ok: true, status: 200, headers: new Headers(), json: async () => CLIP });

/** Último cuerpo JSON que el motor envió por fetch. */
function ultimoCuerpo(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const llamada = fetchMock.mock.calls.at(-1);
  if (!llamada) throw new Error("no hubo ninguna llamada al fetch");
  return JSON.parse(String(llamada[1]?.body)) as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reiniciarFrenoKimodo();
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarFrenoKimodo();
});

describe("contrato del cuerpo a /api/movimiento/generar", () => {
  it("envía exactamente las cuatro claves que exige la ruta", async () => {
    await moverAvatar({ prompt: "saludar con la mano" }, { nivel: "vivo" });
    expect(Object.keys(ultimoCuerpo(fetchMock)).sort()).toEqual([
      "esqueleto",
      "prompt",
      "segundos",
      "semilla",
    ]);
  });

  it("duracionMs 200 (bajo el mínimo) se acota a 0,5 segundos", async () => {
    await moverAvatar({ prompt: "gesto corto", duracionMs: 200 }, { nivel: "vivo" });
    const cuerpo = ultimoCuerpo(fetchMock);
    expect(cuerpo).toMatchObject({ segundos: 0.5, esqueleto: "smplx22" });
  });

  it("duracionMs 60000 (sobre el máximo) se acota a 10 segundos", async () => {
    await moverAvatar({ prompt: "gesto largo", duracionMs: 60000 }, { nivel: "vivo" });
    expect(ultimoCuerpo(fetchMock)).toMatchObject({ segundos: 10 });
  });

  it("sin duración manda los 2,4 segundos por defecto", async () => {
    await moverAvatar({ prompt: "gesto sin duración" }, { nivel: "vivo" });
    expect(ultimoCuerpo(fetchMock)).toMatchObject({ segundos: 2.4 });
  });

  it("un prompt de 400 caracteres llega saneado a 300", async () => {
    await moverAvatar({ prompt: "ab".repeat(200) }, { nivel: "vivo" });
    const cuerpo = ultimoCuerpo(fetchMock);
    expect(typeof cuerpo.prompt).toBe("string");
    expect(String(cuerpo.prompt)).toHaveLength(300);
  });

  it("la semilla es un entero estable para el mismo prompt", async () => {
    await moverAvatar({ prompt: "respirar sin prisa" }, { nivel: "vivo" });
    const cuerpo = ultimoCuerpo(fetchMock);
    const esperada = semillaDelPrompt("respirar sin prisa");
    expect(cuerpo.semilla).toBe(esperada);
    expect(Number.isInteger(esperada)).toBe(true);
    expect(esperada).toBeGreaterThanOrEqual(0);
    // Estable en el tiempo: la misma frase produce el mismo número.
    expect(semillaDelPrompt("respirar sin prisa")).toBe(esperada);
  });
});
