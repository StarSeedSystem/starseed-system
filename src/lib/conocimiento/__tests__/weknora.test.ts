import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buscar,
  credencialesWeKnora,
  listarBases,
  MAX_BASES,
  MAX_CONSULTA,
  MAX_CONTENIDO,
  REFERENCIA_WEKNORA,
  sondear,
  VARIABLES_WEKNORA,
  type CredencialesWeKnora,
  type FetchWeKnora,
} from "../weknora";
import type { PeticionLectura, RelojLectura, RespuestaLectura } from "../../servidores/lectura-http";

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive entera en el repositorio.
const CLAVE = ["clave", "weknora", "de", "prueba", "4410"].join("-");
const CRED: CredencialesWeKnora = { url: "https://saber.local:8080", token: CLAVE };

const resp = (estado: number, cuerpo: string, extra: Partial<RespuestaLectura> = {}): RespuestaLectura => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  headers: { get: () => null },
  text: async () => cuerpo,
  ...extra,
});
const json = (estado: number, valor: unknown) => resp(estado, JSON.stringify(valor));

function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj: RelojLectura = {
    ahora: () => t,
    tras: (ms) => {
      const p = { en: t + ms, r: (): void => undefined };
      timers.push(p);
      return {
        promesa: new Promise<void>((res) => {
          p.r = res;
        }),
        cancelar: () => {
          timers.splice(timers.indexOf(p) >>> 0, 1);
        },
      };
    },
  };
  return {
    reloj,
    avanzar: (ms: number) => {
      t += ms;
      for (const p of timers.filter((x) => x.en <= t)) {
        timers.splice(timers.indexOf(p), 1);
        p.r();
      }
    },
  };
}

describe("weknora · la clave y la URL por el nombre de su variable", () => {
  it("lee WEKNORA_URL y WEKNORA_API_KEY del entorno que le pasan", () => {
    expect(VARIABLES_WEKNORA).toEqual({ url: "WEKNORA_URL", clave: "WEKNORA_API_KEY" });
    const r = credencialesWeKnora({ WEKNORA_URL: "http://10.0.0.7:8080", WEKNORA_API_KEY: CLAVE });
    expect(r).toEqual({ ok: true, credenciales: { url: "http://10.0.0.7:8080", token: CLAVE } });
  });

  it("sin configurar dice qué variables faltan, sin inventar ni repetir valores", () => {
    const r = credencialesWeKnora({});
    expect(r).toMatchObject({ ok: false, faltan: ["WEKNORA_URL", "WEKNORA_API_KEY"] });
    expect(r.ok ? "" : r.motivo).toMatch(/WEKNORA_URL y WEKNORA_API_KEY/);
    expect(JSON.stringify(credencialesWeKnora({ WEKNORA_URL: "https://x.local" }))).toMatch(/WEKNORA_API_KEY/);
  });

  it("la referencia dice dónde y cuándo se comprobó cada ruta", () => {
    expect(REFERENCIA_WEKNORA.repo).toBe("https://github.com/Tencent/WeKnora");
    expect(REFERENCIA_WEKNORA.comprobada).toBe("2026-10-26");
    expect(REFERENCIA_WEKNORA.rutas).toEqual(["GET /health", "GET /api/v1/knowledge-bases", "POST /api/v1/knowledge-search"]);
  });
});

describe("weknora · sondear (GET /health, sin clave)", () => {
  it("pregunta a /health del backend sin mandar la clave; {status:ok} es sano", async () => {
    const f = vi.fn<FetchWeKnora>(async () => json(200, { status: "ok" }));
    const r = await sondear(CRED, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url).toBe("https://saber.local:8080/health");
    expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(init.headers["x-api-key"]).toBeUndefined();
    expect(r).toMatchObject({ ok: true, datos: { ok: true, estado: "ok" } });
  });

  it("otro estado no es «ok»; algo que no es objeto es error de datos; un 404 explica el puerto del frontend", async () => {
    expect(await sondear(CRED, async () => json(200, { status: "degradado" }))).toMatchObject({ ok: true, datos: { ok: false, estado: "degradado" } });
    expect(await sondear(CRED, async () => json(200, "ok"))).toMatchObject({ ok: false, fallo: "datos" });
    expect(await sondear(CRED, async () => resp(404, ""))).toMatchObject({ ok: false, fallo: "http", motivo: expect.stringMatching(/puerto 8080/) });
  });
});

describe("weknora · listarBases (GET /api/v1/knowledge-bases)", () => {
  it("manda la clave en X-API-Key, mapea lo que venga y deja «sin dato» lo que falte", async () => {
    const f = vi.fn<FetchWeKnora>(async () =>
      json(200, {
        success: true,
        data: [
          { id: "kb-1", name: "Astraura", description: "Todo sobre Astraura", type: "document", knowledge_count: 12, chunk_count: 340, is_processing: false, updated_at: "2026-10-20T10:00:00Z", extra: "ajeno" },
          { id: "kb-2" },
          { name: "sin id: se descarta" },
          "texto basura",
        ],
        total: 2,
      }),
    );
    const r = await listarBases(CRED, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url).toBe("https://saber.local:8080/api/v1/knowledge-bases");
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", "x-api-key": CLAVE } });
    expect(init.headers.authorization).toBeUndefined();
    expect(r.ok ? r.datos : r.motivo).toEqual([
      { id: "kb-1", nombre: "Astraura", descripcion: "Todo sobre Astraura", tipo: "document", documentos: 12, fragmentos: 340, procesando: false, actualizada: "2026-10-20T10:00:00Z" },
      { id: "kb-2", nombre: null, descripcion: null, tipo: null, documentos: null, fragmentos: null, procesando: null, actualizada: null },
    ]);
  });

  it("no duplica /api/v1 si la URL ya lo trae y respeta una subruta", async () => {
    const f = vi.fn<FetchWeKnora>(async () => json(200, { success: true, data: [] }));
    await listarBases({ url: "https://saber.local/api/v1/", token: CLAVE }, f);
    await listarBases({ url: "https://saber.local/weknora", token: CLAVE }, f);
    expect(f.mock.calls[0]?.[0]).toBe("https://saber.local/api/v1/knowledge-bases");
    expect(f.mock.calls[1]?.[0]).toBe("https://saber.local/weknora/api/v1/knowledge-bases");
  });

  it("una respuesta sin lista es un error de datos honesto", async () => {
    expect(await listarBases(CRED, async () => json(200, { success: true, data: {} }))).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("lista de bases") });
    expect(await listarBases(CRED, async () => json(200, []))).toMatchObject({ ok: false, fallo: "datos" });
  });
});

describe("weknora · buscar (POST /api/v1/knowledge-search)", () => {
  const fragmento = {
    id: "ch-1",
    content: "WeKnora recupera fragmentos con citas.",
    score: 0.83,
    match_type: "vector",
    chunk_type: "text",
    knowledge_id: "k-9",
    knowledge_title: "Guía de Astraura",
    knowledge_filename: "guia.pdf",
    knowledge_base_id: "kb-1",
    otro: "ajeno",
  };

  it("manda query, bases y match_count tal como documenta la API, con la clave y sin seguir redirecciones", async () => {
    const f = vi.fn<FetchWeKnora>(async () => json(200, { success: true, data: [fragmento], meta: { rerank: { outcome: "ok" } } }));
    const r = await buscar(CRED, { consulta: "  ¿qué es Astraura?  ", bases: ["kb-1", " kb-2 "], limite: 3 }, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url).toBe("https://saber.local:8080/api/v1/knowledge-search");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: { "x-api-key": CLAVE, "content-type": "application/json" } });
    expect(JSON.parse(init.body ?? "")).toEqual({ query: "¿qué es Astraura?", knowledge_base_ids: ["kb-1", "kb-2"], match_count: 3 });
    expect(r.ok ? r.datos : r.motivo).toEqual({
      fragmentos: [
        { id: "ch-1", contenido: "WeKnora recupera fragmentos con citas.", recortado: false, puntuacion: 0.83, coincidencia: "vector", tipoFragmento: "text", documentoId: "k-9", documento: "Guía de Astraura", baseId: "kb-1" },
      ],
      motivoVacio: null,
    });
  });

  it("reordenar:false manda rerank.enabled=false; el límite se acota a 1–20 y por defecto es 5", async () => {
    const f = vi.fn<FetchWeKnora>(async () => json(200, { success: true, data: [] }));
    await buscar(CRED, { consulta: "x", bases: ["kb-1"], reordenar: false, limite: 500 }, f);
    await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, f);
    await buscar(CRED, { consulta: "x", bases: ["kb-1"], limite: 0 }, f);
    const cuerpos = f.mock.calls.map(([, init]) => JSON.parse((init as PeticionLectura).body ?? ""));
    expect(cuerpos[0]).toEqual({ query: "x", knowledge_base_ids: ["kb-1"], match_count: 20, rerank: { enabled: false } });
    expect(cuerpos[1]).toEqual({ query: "x", knowledge_base_ids: ["kb-1"], match_count: 5 });
    expect(cuerpos[2].match_count).toBe(1);
  });

  it("pide lo que falta ANTES de llamar: consulta vacía o larguísima, sin bases o demasiadas", async () => {
    const f = vi.fn<FetchWeKnora>();
    expect(await buscar(CRED, { consulta: "   ", bases: ["kb-1"] }, f)).toMatchObject({ ok: false, fallo: "peticion", motivo: expect.stringMatching(/qué quieres buscar/) });
    expect(await buscar(CRED, { consulta: "x".repeat(MAX_CONSULTA + 1), bases: ["kb-1"] }, f)).toMatchObject({ ok: false, fallo: "peticion", motivo: expect.stringMatching(/demasiado larga/) });
    expect(await buscar(CRED, { consulta: "x", bases: [] }, f)).toMatchObject({ ok: false, fallo: "peticion", motivo: expect.stringMatching(/qué base/) });
    expect(await buscar(CRED, { consulta: "x", bases: ["", "  "] }, f)).toMatchObject({ ok: false, fallo: "peticion" });
    const muchas = Array.from({ length: MAX_BASES + 1 }, (_, i) => `kb-${i}`);
    expect(await buscar(CRED, { consulta: "x", bases: muchas }, f)).toMatchObject({ ok: false, fallo: "peticion", motivo: expect.stringContaining(String(MAX_BASES)) });
    expect(f).not.toHaveBeenCalled();
  });

  it("recorta el texto largo y lo dice; usa el nombre del archivo si no hay título", async () => {
    const largo = "palabra ".repeat(1000);
    const r = await buscar(
      CRED,
      { consulta: "x", bases: ["kb-1"] },
      async () => json(200, { success: true, data: [{ id: "a", content: largo, knowledge_filename: "notas.md" }, "basura"] }),
    );
    const f0 = r.ok ? r.datos.fragmentos : [];
    expect(f0).toHaveLength(1);
    expect(f0[0]?.recortado).toBe(true);
    expect((f0[0]?.contenido ?? "").length).toBeLessThanOrEqual(MAX_CONTENIDO + 1);
    expect(f0[0]?.documento).toBe("notas.md");
    expect(f0[0]?.puntuacion).toBeNull();
  });

  it("sin resultados, dice por qué si WeKnora lo cuenta en meta.rerank.outcome (como manda su documentación)", async () => {
    const r = await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => json(200, { success: true, data: [], meta: { rerank: { outcome: "filtered_by_threshold" } } }));
    expect(r.ok ? r.datos : r.motivo).toEqual({ fragmentos: [], motivoVacio: "filtered_by_threshold" });
    const sinMeta = await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => json(200, { success: true, data: [] }));
    expect(sinMeta.ok ? sinMeta.datos.motivoVacio : "error").toBeNull();
  });

  it("una respuesta con otra forma es un error de datos; si trae error.message, se cuenta recortado", async () => {
    expect(await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => json(200, { success: true, data: "nada" }))).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("lista de resultados") });
    const conError = await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => json(200, { success: false, error: { code: 1003, message: "KB no encontrada" } }));
    expect(conError).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("KB no encontrada") });
  });
});

describe("weknora · estados honestos y la clave jamás fuera de su sitio", () => {
  it("401 clave inválida · 403 sin la capacidad retrieve · 404 no es el backend · 429 despacio, cada uno con su motivo", async () => {
    expect(await listarBases(CRED, async () => resp(401, ""))).toMatchObject({ ok: false, fallo: "http", estado: 401, motivo: expect.stringMatching(/Clave de API inválida.*WEKNORA_API_KEY/) });
    expect(await listarBases(CRED, async () => resp(403, ""))).toMatchObject({ motivo: expect.stringMatching(/capacidad «retrieve»/) });
    expect(await listarBases(CRED, async () => resp(404, ""))).toMatchObject({ motivo: expect.stringMatching(/\/api\/v1 del backend/) });
    expect(await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => resp(429, ""))).toMatchObject({ motivo: expect.stringMatching(/más despacio/) });
    expect(await buscar(CRED, { consulta: "x", bases: ["kb-1"] }, async () => resp(400, "{}"))).toMatchObject({ estado: 400, motivo: expect.stringMatching(/rechazó la petición/) });
  });

  it("una redirección no se sigue (la clave no sale de la instancia) y un fallo de red no lanza", async () => {
    const f = vi.fn<FetchWeKnora>(async () => resp(301, ""));
    expect(await listarBases(CRED, f)).toMatchObject({ ok: false, fallo: "http", estado: 301, motivo: expect.stringMatching(/WEKNORA_URL/) });
    expect(f).toHaveBeenCalledTimes(1);
    expect(
      await listarBases(CRED, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toMatchObject({ ok: false, fallo: "red" });
  });

  it("credenciales inválidas: no llama y dice por qué sin repetir la clave", async () => {
    const f = vi.fn<FetchWeKnora>();
    expect(await listarBases({ url: "no es url", token: CLAVE }, f)).toMatchObject({ ok: false, fallo: "credenciales" });
    expect(await buscar({ url: "https://x.local", token: "" }, { consulta: "x", bases: ["kb-1"] }, f)).toMatchObject({ ok: false, fallo: "credenciales", motivo: expect.stringContaining("WEKNORA_API_KEY") });
    expect(f).not.toHaveBeenCalled();
  });

  it("ni los motivos ni el registro llevan la clave, y el texto buscado no se anota", async () => {
    const lineas: string[] = [];
    const secreta = "contrato confidencial de la sanga";
    const r = await buscar(CRED, { consulta: secreta, bases: ["kb-1"] }, async () => resp(500, `fallo con ${CLAVE} dentro`), { registrar: (l) => lineas.push(l) });
    expect(r).toMatchObject({ ok: false, fallo: "http", estado: 500 });
    expect(JSON.stringify(r)).not.toContain(CLAVE);
    expect(JSON.stringify(lineas)).not.toContain(CLAVE);
    expect(JSON.stringify(lineas)).not.toContain(secreta);
    const buenas: string[] = [];
    await buscar(CRED, { consulta: secreta, bases: ["kb-1"] }, async () => json(200, { success: true, data: [] }), { registrar: (l) => buenas.push(l) });
    expect(JSON.stringify(buenas)).not.toContain(secreta);
    expect(buenas[0]).toMatch(/WeKnora POST \/knowledge-search · 200 · ok/);
  });

  it("tiempo agotado: corta la petición con el reloj inyectado", async () => {
    const { reloj, avanzar } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchWeKnora = (_u, i) => {
      senal = i.signal;
      return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado"))));
    };
    const p = buscar(CRED, { consulta: "x", bases: ["kb-1"] }, colgado, { reloj });
    avanzar(14_999);
    expect(senal?.aborted).toBe(false);
    avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 15_000, motivo: expect.stringContaining("15 s") });
    expect(senal?.aborted).toBe(true);
  });

  it("la sonda tiene un plazo más corto (6 s)", async () => {
    const { reloj, avanzar } = relojFalso();
    const p = sondear(CRED, () => new Promise(() => undefined), { reloj });
    avanzar(6_000);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 6_000 });
  });
});

describe("weknora · solo lectura y módulo puro", () => {
  it("no toca nada que no sea de lectura: ninguna ruta de chat, ni de borrado, ni PUT/PATCH/DELETE", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../weknora.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/knowledge-chat|agent-chat|sessions|\bPUT\b|\bPATCH\b|\bDELETE\b/);
    expect(codigo).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
    expect(codigo).not.toMatch(/process\.env/);
    expect(codigo).not.toMatch(/^\s*["']use client["']/m);
  });
});
