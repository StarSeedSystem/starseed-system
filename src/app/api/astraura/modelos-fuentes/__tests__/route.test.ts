import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const pide = (u: string) => GET(new Request(`http://localhost/api/astraura/modelos-fuentes?u=${encodeURIComponent(u)}`));

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/astraura/modelos-fuentes", () => {
  it("rechaza lo que no está en la lista cerrada, sin salir a la red", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const u of ["https://abliteration.ai/v1/models", "https://ollama.com/library/huihui_ai/x", "http://ollama.com/library/qwen3.5", ""]) {
      expect((await pide(u)).status).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("trae una fuente permitida sin seguir redirecciones", async () => {
    const f = vi.fn(async () => new Response("Model,eci,date\n", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await pide("https://epoch.ai/data/eci_scores.csv");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Model");
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "manual" });
  });
  it("una fuente caída responde 502 sin romper", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
    expect((await pide("https://ollama.com/library/gemma4/tags")).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 301 })));
    expect((await pide("https://ollama.com/library/gemma4")).status).toBe(502);
  });
});
