// @vitest-environment jsdom
/**
 * Freno de la vía Kimodo (2026-10-26): el mundo de los avatares hizo >43.000 POST a /api/movimiento/generar en bucle
 * contra un 429. El mismo gesto se pide una vez, como mucho 2 a la vez, y un 429 pausa la vía respetando Retry-After.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: async () => ({}),
  capacidadesEnCache: () => null,
}));
import { kimodoEnPausaHasta, moverAvatar, reiniciarFrenoKimodo, type Gesto, type MovimientoClip } from "../motor";

const CLIP: MovimientoClip = { esqueleto: "smplx22", fps: 30, duracionMs: 1000, rotaciones: [[0], [0]], raiz: [[0, 0, 0], [0, 0, 0]], origen: "kimodo" } as MovimientoClip;
const gesto = (prompt: string): Gesto => ({ prompt, energia: 0.5, duracionMs: 1000 } as Gesto);
const ok = () => ({ ok: true, status: 200, headers: new Headers(), json: async () => CLIP });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reiniciarFrenoKimodo();
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); reiniciarFrenoKimodo(); });

describe("freno de la vía Kimodo", () => {
  it("el mismo gesto se pide una sola vez (caché)", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await moverAvatar(gesto("respirar lentamente"), { nivel: "vivo" });
      expect(r).toMatchObject({ nivel: "vivo", clip: CLIP });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("peticiones iguales a la vez comparten la misma", async () => {
    await Promise.all([1, 2, 3, 4].map(() => moverAvatar(gesto("concentrar"), { nivel: "vivo" })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("como mucho 2 en vuelo: el resto baja a «ligero» sin pedir", async () => {
    let soltar: () => void = () => {};
    const espera = new Promise<void>((r) => { soltar = r; });
    fetchMock.mockImplementation(async () => { await espera; return ok(); });
    const rs = [1, 2, 3, 4, 5].map((i) => moverAvatar(gesto(`gesto ${i}`), { nivel: "vivo" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    soltar();
    const niveles = (await Promise.all(rs)).map((r) => r.nivel);
    expect(niveles.filter((n) => n === "vivo")).toHaveLength(2);
    expect(niveles.filter((n) => n === "ligero")).toHaveLength(3);
  });

  it("un 429 pausa la vía (con su Retry-After) y el avatar sigue con el clip procedural", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": "120" }), json: async () => ({}) }));
    const r1 = await moverAvatar(gesto("saludar"), { nivel: "vivo" });
    expect(r1.nivel).toBe("ligero");
    expect(r1.clip?.origen).toBe("procedural");
    expect(kimodoEnPausaHasta()).toBeGreaterThan(Date.now() + 100_000);
    for (let i = 0; i < 10; i++) await moverAvatar(gesto(`otro ${i}`), { nivel: "vivo" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // en pausa: nadie más pide
  });

  it("al acabar la pausa vuelve a probar, y un éxito reinicia la escalera", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) }));
    await moverAvatar(gesto("a"), { nivel: "vivo" });
    expect(kimodoEnPausaHasta()).toBeGreaterThan(0);
    vi.setSystemTime(Date.now() + 31_000);
    expect(kimodoEnPausaHasta()).toBe(0);
    const r = await moverAvatar(gesto("b"), { nivel: "vivo" });
    expect(r.nivel).toBe("vivo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
