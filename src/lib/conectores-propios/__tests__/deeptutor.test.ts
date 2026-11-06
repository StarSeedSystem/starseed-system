import { describe, it, expect, vi, afterEach } from "vitest";
import {
  configDeeptutor,
  estadoDeeptutor,
  normalizarModo,
  preguntarTutor,
  type FetchFn,
  type RespuestaHttp,
} from "../deeptutor";

const ENV = { DEEPTUTOR_URL: "http://127.0.0.1:8001/", DEEPTUTOR_TOKEN: "tk-secreto" };
const PLAZO_MS = 8000;

function respuesta(status: number, cuerpo: unknown): RespuestaHttp {
  return { ok: status < 400, status, text: async () => JSON.stringify(cuerpo) };
}

function falso(status: number, cuerpo: unknown) {
  const llamadas: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    llamadas.push({ url, method: init.method, headers: init.headers, body: init.body });
    return respuesta(status, cuerpo);
  };
  return { fetchFn, llamadas };
}

afterEach(() => vi.useRealTimers());

describe("deeptutor · conector opcional", () => {
  it("normaliza el modo de la integración a los cuatro del método", () => {
    expect(normalizarModo("cuestionario")).toBe("comprobar");
    expect(normalizarModo("Practice")).toBe("practicar");
    expect(normalizarModo("resumen")).toBe("resumir");
    expect(normalizarModo(undefined)).toBe("explicar");
    expect(normalizarModo("otra-cosa")).toBe("explicar");
  });

  it("config lee URL y token del entorno y normaliza", () => {
    expect(configDeeptutor(ENV)).toEqual({
      url: "http://127.0.0.1:8001",
      token: "tk-secreto",
      agente: "tutor",
    });
  });

  it("sin URL válida no hay conector", () => {
    expect(configDeeptutor({})).toBeNull();
    expect(configDeeptutor({ DEEPTUTOR_URL: "no-es-url" })).toBeNull();
  });

  it("usa agente por defecto 'tutor' y permite agente personalizado", () => {
    expect(configDeeptutor(ENV).agente).toBe("tutor");
    expect(configDeeptutor({ ...ENV, DEEPTUTOR_AGENTE: "mi-agente" }).agente).toBe("mi-agente");
    expect(configDeeptutor({ ...ENV, DEEPTUTOR_AGENTE: "  " }).agente).toBe("tutor");
  });

  it("url limpia trailing slash y espacios", () => {
    expect(configDeeptutor({ ...ENV, DEEPTUTOR_URL: "http://127.0.0.1:8001/" }).url).toBe("http://127.0.0.1:8001");
    expect(configDeeptutor({ ...ENV, DEEPTUTOR_URL: "  http://127.0.0.1:8001  " }).url).toBe("http://127.0.0.1:8001");
    expect(configDeeptutor({ ...ENV, DEEPTUTOR_URL: "http://127.0.0.1:8001//  " }).url).toBe("http://127.0.0.1:8001");
  });

  it("estado consulta /api/system/status con Bearer y sin token en la URL", async () => {
    const { fetchFn, llamadas } = falso(200, { backend: { status: "online" } });
    const r = await estadoDeeptutor(configDeeptutor(ENV), fetchFn);
    expect(r).toEqual({ disponible: true, url: "http://127.0.0.1:8001" });
    expect(llamadas[0].url).toBe("http://127.0.0.1:8001/api/system/status");
    expect(llamadas[0].headers?.Authorization).toBe("Bearer tk-secreto");
    expect(llamadas[0].url).not.toContain("tk-secreto");
  });

  it("estado no lanza si la red falla o el HTTP es de error", async () => {
    const rota: FetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect((await estadoDeeptutor(configDeeptutor(ENV), rota)).disponible).toBe(false);
    const { fetchFn } = falso(500, {});
    const r = await estadoDeeptutor(configDeeptutor(ENV), fetchFn);
    expect(r).toEqual({ disponible: false, motivo: expect.stringContaining("500") });
  });

  it("estado limpia el plazo", async () => {
    vi.useFakeTimers();
    const colgada: FetchFn = () => new Promise(() => {});
    const pendiente = estadoDeeptutor(configDeeptutor(ENV), colgada);
    await vi.advanceTimersByTimeAsync(PLAZO_MS + 1);
    expect((await pendiente).disponible).toBe(false);
  });

  it("pregunta por el chat HTTP del compañero y devuelve el texto", async () => {
    const { fetchFn, llamadas } = falso(200, { content: "Un límite es…", session_id: "s1" });
    const r = await preguntarTutor(configDeeptutor(ENV), fetchFn, {
      pregunta: "¿Qué es un límite?",
      modo: "explicar",
    });
    expect(r).toEqual({ texto: "Un límite es…", modo: "explicar", sesion: "s1" });
    expect(llamadas[0].url).toBe("http://127.0.0.1:8001/api/partners/tutor/chat");
    expect(llamadas[0].method).toBe("POST");
    const cuerpo = JSON.parse(llamadas[0].body ?? "{}");
    expect(cuerpo.content).toContain("¿Qué es un límite?");
    expect(cuerpo.content).toContain("Explica");
    expect(llamadas[0].headers?.["Content-Type"]).toBe("application/json");
  });

  it("pregunta devuelve null ante fallo, cuerpo raro o plazo", async () => {
    const cfg = configDeeptutor(ENV);
    const q = { pregunta: "¿Qué es un límite?", modo: "explicar" as const };
    expect(await preguntarTutor(cfg, falso(500, {}).fetchFn, q)).toBeNull();
    const rota: FetchFn = async () => {
      throw new Error("sin red");
    };
    expect(await preguntarTutor(cfg, rota, q)).toBeNull();
    expect(await preguntarTutor(cfg, falso(200, { nada: 1 }).fetchFn, q)).toBeNull();
    vi.useFakeTimers();
    const colgada: FetchFn = () => new Promise(() => {});
    const pendiente = preguntarTutor(cfg, colgada, q);
    await vi.advanceTimersByTimeAsync(PLAZO_MS + 1);
    expect(await pendiente).toBeNull();
  });

  it("sin conector o sin pregunta no llama a nadie", async () => {
    const { fetchFn, llamadas } = falso(200, { content: "x" });
    expect(await preguntarTutor(null, fetchFn, { pregunta: "x", modo: "resumir" })).toBeNull();
    expect(
      await preguntarTutor(configDeeptutor(ENV), fetchFn, { pregunta: "   ", modo: "resumir" }),
    ).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("pregunta usa agente personalizado en la URL", async () => {
    const cfg = configDeeptutor({ ...ENV, DEEPTUTOR_AGENTE: "mi-agente" });
    const { fetchFn, llamadas } = falso(200, { content: "Respuesta", session_id: "s2" });
    const r = await preguntarTutor(cfg, fetchFn, { pregunta: "¿Hola?", modo: "explicar" });
    expect(llamadas[0].url).toBe("http://127.0.0.1:8001/api/partners/mi-agente/chat");
    expect(r).toEqual({ texto: "Respuesta", modo: "explicar", sesion: "s2" });
  });

  it("pregunta aplica instrucción para cada modo", async () => {
    const modos: Array<"explicar" | "comprobar" | "practicar" | "resumir"> = [
      "explicar", "comprobar", "practicar", "resumir",
    ];
    for (const modo of modos) {
      const { fetchFn, llamadas } = falso(200, { content: "x", session_id: "s1" });
      await preguntarTutor(configDeeptutor(ENV), fetchFn, { pregunta: "P", modo });
      const cuerpo = JSON.parse(llamadas[0].body ?? "{}");
      expect(cuerpo.content).toContain("P");
    }
  });

  it("pregunta devuelve sesion null cuando el servidor no la envía", async () => {
    const { fetchFn } = falso(200, { content: "Sin sesión" });
    const r = await preguntarTutor(configDeeptutor(ENV), fetchFn, { pregunta: "Hola", modo: "explicar" });
    expect(r).toEqual({ texto: "Sin sesión", modo: "explicar", sesion: null });
  });

  it("estado devuelve motivo específico para 401/403/404/500", async () => {
    const m401 = await estadoDeeptutor(configDeeptutor(ENV), falso(401, {}).fetchFn);
    const m403 = await estadoDeeptutor(configDeeptutor(ENV), falso(403, {}).fetchFn);
    const m404 = await estadoDeeptutor(configDeeptutor(ENV), falso(404, {}).fetchFn);
    const m500 = await estadoDeeptutor(configDeeptutor(ENV), falso(500, {}).fetchFn);
    expect(m401.motivo).toContain("401");
    expect(m403.motivo).toContain("403");
    expect(m404.motivo).toContain("404");
    expect(m500.motivo).toContain("falló");
  });
});
