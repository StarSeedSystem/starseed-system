// @vitest-environment jsdom
/**
 * Contrato del cuerpo que el motor manda a POST /api/movimiento/generar:
 * el mismo cuerpo que valida la ruta (prompt ≤ 300, esqueleto, segundos
 * acotados y semilla entera), verificado desde el motor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: async () => ({}),
  capacidadesEnCache: () => null,
}));
import { moverAvatar, reiniciarFrenoKimodo, semillaDePrompt, type MovimientoClip } from "../motor";

const CLIP: MovimientoClip = {
  esqueleto: "smplx22",
  fps: 30,
  duracionMs: 2400,
  rotaciones: [[0], [0]],
  raiz: [[0, 0, 0], [0, 0, 0]],
  origen: "kimodo",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reiniciarFrenoKimodo();
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => CLIP,
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarFrenoKimodo();
});

/** Cuerpo que el motor envió en la petición pedida (0 = la primera). */
function cuerpoEnviado(orden = 0): Record<string, unknown> {
  const llamada = fetchMock.mock.calls[orden];
  const opciones = llamada?.[1] as RequestInit | undefined;
  return JSON.parse(String(opciones?.body ?? "{}")) as Record<string, unknown>;
}

describe("contrato del cuerpo a /api/movimiento/generar", () => {
  it("manda exactamente prompt, esqueleto, segundos y semilla", async () => {
    await moverAvatar({ prompt: "respirar lentamente" }, { nivel: "vivo" });
    const cuerpo = cuerpoEnviado();
    expect(Object.keys(cuerpo).sort()).toEqual(["esqueleto", "prompt", "segundos", "semilla"]);
    expect(cuerpo.esqueleto).toBe("smplx22");
    expect(cuerpo.prompt).toBe("respirar lentamente");
  });

  it("duracionMs 200 queda como 0,5 segundos (mínimo de la ruta)", async () => {
    await moverAvatar({ prompt: "a", duracionMs: 200 }, { nivel: "vivo" });
    expect(cuerpoEnviado().segundos).toBe(0.5);
  });

  it("duracionMs 60000 queda como 10 segundos (máximo de la ruta)", async () => {
    await moverAvatar({ prompt: "a", duracionMs: 60000 }, { nivel: "vivo" });
    expect(cuerpoEnviado().segundos).toBe(10);
  });

  it("sin duración salen 2,4 segundos", async () => {
    await moverAvatar({ prompt: "a" }, { nivel: "vivo" });
    expect(cuerpoEnviado().segundos).toBe(2.4);
  });

  it("un prompt de 400 caracteres llega con 300", async () => {
    await moverAvatar({ prompt: "s".repeat(400) }, { nivel: "vivo" });
    const cuerpo = cuerpoEnviado();
    expect(cuerpo.prompt).toBe("s".repeat(300));
    expect(cuerpo.semilla).toBe(semillaDePrompt("s".repeat(300)));
  });

  it("la semilla es un entero estable para el mismo prompt", async () => {
    // Duraciones distintas para no caer en la caché del mismo gesto.
    await moverAvatar({ prompt: "saludar", duracionMs: 1000 }, { nivel: "vivo" });
    await moverAvatar({ prompt: "saludar", duracionMs: 2000 }, { nivel: "vivo" });
    const s1 = cuerpoEnviado(0).semilla;
    const s2 = cuerpoEnviado(1).semilla;
    expect(typeof s1).toBe("number");
    expect(Number.isInteger(s1)).toBe(true);
    expect(s1).toBe(s2);
    expect(s1).toBe(semillaDePrompt("saludar"));
  });
});
