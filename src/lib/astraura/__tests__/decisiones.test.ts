import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAZO_DECISION_MS,
  decidir,
  enrutar,
  intencion,
  moderar,
} from "../decisiones";

function respuestaBuena(id: string, answer: string, confidence = 0.87): Response {
  return new Response(JSON.stringify({
    ok: true,
    answers: [{ id, answer, probs: { [answer]: confidence }, confidence }],
    medio: "local",
    ms: 12,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("contrato único de decisiones de Astraura", () => {
  beforeEach(() => {
    process.env.STARSEED_BASE_URL = "https://starseed.test";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.STARSEED_BASE_URL;
  });

  it("envía el contrato de JV8 a la URL del servidor y devuelve respuestas tipadas", async () => {
    const fetchSimulado = vi.fn(async () => respuestaBuena("ruta", "social"));
    vi.stubGlobal("fetch", fetchSimulado);

    const respuestas = await decidir({ peticion: "compartir" }, [{
      id: "ruta",
      type: "choice",
      question: "¿Destino?",
      options: ["social", "archivo"],
    }]);

    expect(respuestas?.[0]).toMatchObject({
      id: "ruta",
      answer: "social",
      confidence: 0.87,
    });
    expect(fetchSimulado).toHaveBeenCalledWith(
      "https://starseed.test/api/jev/systemone",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("una respuesta buena produce veredicto y confianza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuestaBuena("moderacion", "publicar", 0.93)));

    await expect(moderar("Una publicación respetuosa")).resolves.toEqual({
      veredicto: "publicar",
      confianza: 0.93,
      decidio: true,
    });
  });

  it("un HTTP 500 deja la regla del llamador intacta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    const resultado = await moderar("Texto que debe seguir el flujo del producto");
    expect(resultado).toEqual({ veredicto: null, confianza: 0, decidio: false });
    expect(resultado.decidio).toBe(false);
    // `null` no publica ni prohíbe: hoy el llamador de moderación decide publicar.
  });

  it("un plazo vencido devuelve decidio:false", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    const pendiente = moderar("Texto pendiente");
    await vi.advanceTimersByTimeAsync(PLAZO_DECISION_MS);

    await expect(pendiente).resolves.toEqual({
      veredicto: null,
      confianza: 0,
      decidio: false,
    });
  });

  it("enrutado e intención solo aceptan veredictos de sus listas", async () => {
    const fetchSimulado = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body)) as {
        questions: Array<{ id: string }>;
      };
      const id = cuerpo.questions[0]?.id ?? "";
      return respuestaBuena(id, id === "enrutado" ? "biblioteca" : "crear", 0.81);
    });
    vi.stubGlobal("fetch", fetchSimulado);

    await expect(enrutar("Guarda este libro", ["biblioteca", "social"] as const))
      .resolves.toEqual({ veredicto: "biblioteca", confianza: 0.81, decidio: true });
    await expect(intencion("Quiero dibujar", ["crear", "consultar"] as const))
      .resolves.toEqual({ veredicto: "crear", confianza: 0.81, decidio: true });
  });

  it("nunca lanza ante red caída o respuesta ilegible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("red caída");
    }));
    await expect(intencion("hola", ["saludar"] as const)).resolves.toEqual({
      veredicto: null,
      confianza: 0,
      decidio: false,
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", { status: 200 })));
    await expect(enrutar("consulta", ["aurora"] as const)).resolves.toEqual({
      veredicto: null,
      confianza: 0,
      decidio: false,
    });
  });
});
