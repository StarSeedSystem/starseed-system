import { describe, it, expect } from "vitest";
import {
  capacidadDeModo,
  configDeeptutor,
  estadoDeeptutor,
  preguntarTutor,
  textoDeRespuesta,
  RUTA_PREGUNTAR,
  type ConfigDeeptutor,
  type FetchFn,
} from "../deeptutor";

const CONFIG: ConfigDeeptutor = { url: "http://127.0.0.1:3782", token: "jwt-secreto" };

function falso(status = 200, cuerpo = "", ok = status < 400) {
  const llamadas: { url: string; init: Parameters<FetchFn>[1] }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    llamadas.push({ url, init });
    return { ok, status, text: async () => cuerpo };
  };
  return { fetchFn, llamadas };
}

describe("deeptutor · conector opcional", () => {
  it("sin URL válida no hay conector", () => {
    expect(configDeeptutor({})).toBeNull();
    expect(configDeeptutor({ DEEPTUTOR_URL: "   " })).toBeNull();
    expect(configDeeptutor({ DEEPTUTOR_URL: "ftp://x" })).toBeNull();
  });

  it("normaliza la URL y recorta el token", () => {
    expect(
      configDeeptutor({ DEEPTUTOR_URL: " http://127.0.0.1:3782/ ", DEEPTUTOR_TOKEN: " tok " }),
    ).toEqual({ url: "http://127.0.0.1:3782", token: "tok" });
    expect(configDeeptutor({ DEEPTUTOR_URL: "https://tutor.example.com" })).toEqual({
      url: "https://tutor.example.com",
      token: "",
    });
  });

  it("traduce los modos del OS a capacidades canónicas", () => {
    expect(capacidadDeModo("Resolver")).toBe("deep_solve");
    expect(capacidadDeModo("practicar")).toBe("deep_question");
    expect(capacidadDeModo("investigar")).toBe("deep_research");
    expect(capacidadDeModo("otra-cosa")).toBe("chat");
  });

  it("extrae texto de JSON y también de un flujo SSE", () => {
    expect(textoDeRespuesta('{"content":"Hola"}')).toBe("Hola");
    expect(textoDeRespuesta('data: {"content":"Ho"}\n\ndata: {"content":"la"}\n\ndata: [DONE]')).toBe("Hola");
    expect(textoDeRespuesta("   ")).toBe("");
  });

  it("estado: verdadero si responde; falso si falla o se pasa de plazo", async () => {
    expect(await estadoDeeptutor(CONFIG, falso(200, "{}").fetchFn)).toBe(true);
    expect(await estadoDeeptutor(CONFIG, falso(500, "{}").fetchFn)).toBe(false);
    const colgado: FetchFn = () => new Promise(() => {});
    expect(await estadoDeeptutor(CONFIG, colgado, 5)).toBe(false);
  });

  it("pregunta con el token solo en la cabecera y devuelve el texto", async () => {
    const { fetchFn, llamadas } = falso(200, '{"answer":"La raíz de 9 es 3."}');
    const r = await preguntarTutor(CONFIG, fetchFn, { pregunta: " ¿Raíz de 9? ", modo: "explicar" });
    expect(r).toEqual({ texto: "La raíz de 9 es 3.", capacidad: "chat" });
    expect(llamadas[0].url).toBe(`${CONFIG.url}${RUTA_PREGUNTAR}`);
    expect(llamadas[0].init.method).toBe("POST");
    expect(llamadas[0].init.headers.Authorization).toBe("Bearer jwt-secreto");
    expect(llamadas[0].url).not.toContain("jwt-secreto");
    const cuerpo = JSON.parse(llamadas[0].init.body ?? "{}") as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ content: "¿Raíz de 9?", capability: "chat", language: "es" });
  });

  it("sin token no manda Authorization", async () => {
    const { fetchFn, llamadas } = falso(200, '{"content":"ok"}');
    await preguntarTutor({ ...CONFIG, token: "" }, fetchFn, { pregunta: "hola", modo: "chat" });
    expect(llamadas[0].init.headers.Authorization).toBeUndefined();
  });

  it("fallo HTTP, red caída y plazo agotado devuelven null", async () => {
    expect(
      await preguntarTutor(CONFIG, falso(429, "").fetchFn, { pregunta: "x", modo: "chat" }),
    ).toBeNull();
    const red: FetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await preguntarTutor(CONFIG, red, { pregunta: "x", modo: "chat" })).toBeNull();
    const colgado: FetchFn = () => new Promise(() => {});
    expect(await preguntarTutor(CONFIG, colgado, { pregunta: "x", modo: "chat" }, 5)).toBeNull();
  });

  it("respuesta vacía o pregunta en blanco devuelven null", async () => {
    expect(
      await preguntarTutor(CONFIG, falso(200, "").fetchFn, { pregunta: "x", modo: "chat" }),
    ).toBeNull();
    expect(
      await preguntarTutor(CONFIG, falso(200, '{"content":"ok"}').fetchFn, {
        pregunta: "  ",
        modo: "chat",
      }),
    ).toBeNull();
  });
});
