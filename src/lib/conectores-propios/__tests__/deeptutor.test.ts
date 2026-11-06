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

  it("estado devuelve motivo honesto para 401/403", async () => {
    const r401 = await estadoDeeptutor(configDeeptutor(ENV), falso(401, {}).fetchFn);
    const r403 = await estadoDeeptutor(configDeeptutor(ENV), falso(403, {}).fetchFn);
    expect(r401.disponible).toBe(false);
    expect("motivo" in r401 && r401.motivo).toContain("401");
    expect(r403.disponible).toBe(false);
    expect("motivo" in r403 && r403.motivo).toContain("403");
  });

  it("estado devuelve motivo honesto para 404", async () => {
    const r = await estadoDeeptutor(configDeeptutor(ENV), falso(404, {}).fetchFn);
    expect(r.disponible).toBe(false);
    expect("motivo" in r && r.motivo).toContain("404");
  });

  it("estado devuelve motivo honesto para 429", async () => {
    const r = await estadoDeeptutor(configDeeptutor(ENV), falso(429, {}).fetchFn);
    expect(r.disponible).toBe(false);
    expect("motivo" in r && r.motivo).toContain("429");
  });

  it("config respeta DEEPTUTOR_AGENTE personalizado", () => {
    const cfg = configDeeptutor({ DEEPTUTOR_URL: "http://localhost:9000", DEEPTUTOR_TOKEN: "tk", DEEPTUTOR_AGENTE: "mi-agente" });
    expect(cfg).toEqual({ url: "http://localhost:9000", token: "tk", agente: "mi-agente" });
  });

  it("pregunta usa el agente del config en la ruta", async () => {
    const cfg = configDeeptutor({ DEEPTUTOR_URL: "http://localhost:8001", DEEPTUTOR_TOKEN: "tk", DEEPTUTOR_AGENTE: "mi-agente" });
    const { fetchFn, llamadas } = falso(200, { content: "respuesta", session_id: "s2" });
    await preguntarTutor(cfg, fetchFn, { pregunta: "Hola", modo: "explicar" });
    expect(llamadas[0].url).toBe("http://localhost:8001/api/partners/mi-agente/chat");
  });

  it("pregunta incluye instrucción para cada modo", async () => {
    const { fetchFn, llamadas } = falso(200, { content: "ok" });
    const INSTRUCCIONES: Record<"explicar" | "comprobar" | "practicar" | "resumir", string> = {
      explicar: "Explica el concepto con claridad",
      comprobar: "Comprueba lo aprendido",
      practicar: "Propón un ejercicio",
      resumir: "Resume lo aprendido",
    };
    for (const modo of ["explicar", "comprobar", "practicar", "resumir"] as const) {
      await preguntarTutor(configDeeptutor(ENV), fetchFn, { pregunta: "Q", modo });
      const cuerpo = JSON.parse(llamadas[llamadas.length - 1].body ?? "{}") as { content: string };
      expect(cuerpo.content).toContain(INSTRUCCIONES[modo]);
    }
  });
});
