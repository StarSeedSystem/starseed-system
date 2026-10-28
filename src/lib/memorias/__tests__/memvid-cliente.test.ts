import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASE_MEMVID, CABECERA_TOKEN, TOPE_MS, buscar, estado, linea, parsearSujeto, poner, salud,
  type Dependencias,
} from "../memvid-cliente";

const F = new Date(Date.UTC(2026, 9, 28));
const AURORA = { tipo: "personalidad" as const, id: "Aurora" };

function montar(respuestas: Array<() => Response>) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const siguiente = respuestas[i++];
    if (!siguiente) throw new Error("sin respuesta preparada");
    return siguiente();
  });
  const deps: Dependencias = {
    fetch: f as unknown as typeof fetch,
    token: "token-de-prueba",
    ahora: () => F.getTime(),
  };
  return { llamadas, deps };
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsearSujeto", () => {
  it("acepta tipo:id y rechaza lo demás", () => {
    expect(parsearSujeto("personalidad:Aurora")).toEqual({ tipo: "personalidad", id: "Aurora" });
    expect(parsearSujeto("perfil: alex ")).toEqual({ tipo: "perfil", id: "alex" });
    expect(parsearSujeto("inventado:x")).toBeNull();
    expect(parsearSujeto("personalidad:")).toBeNull();
    expect(parsearSujeto("sin-dos-puntos")).toBeNull();
  });
});

describe("salud", () => {
  it("distingue vivo, mal y apagado sin lanzar", async () => {
    expect(await salud(montar([() => json({ ok: true })]).deps)).toBe(true);
    expect(await salud(montar([() => json({}, 500)]).deps)).toBe(false);
    expect(await salud(montar([() => { throw new Error("ECONNREFUSED"); }]).deps)).toBeNull();
  });

  it("sin token no llama a fetch y devuelve null", async () => {
    const { deps } = montar([]);
    const f = deps.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(await salud({ ...deps, token: null })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("poner", () => {
  it("manda texto, título y token a la cápsula cifrada del sujeto", async () => {
    const { llamadas, deps } = montar([() => json({ frame: 7 })]);
    const r = await poner(AURORA, "planes del café", { titulo: "Charla", fecha: F }, deps);
    expect(r).toEqual({ frame: 7, capsula: "personalidad-aurora-2026T4.mv2e" });
    expect(llamadas[0].url).toBe(`${BASE_MEMVID}/capsulas/personalidad-aurora-2026T4.mv2e/poner`);
    expect((llamadas[0].init?.headers as Record<string, string>)[CABECERA_TOKEN]).toBe("token-de-prueba");
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({ texto: "planes del café", titulo: "Charla" });
    expect(TOPE_MS).toBe(1500);
  });

  it("con 507 abre la parte siguiente y reintenta una sola vez", async () => {
    const { llamadas, deps } = montar([() => json({ error: "llena" }, 507), () => json({ frame: 9 })]);
    const r = await poner(AURORA, "más memoria", { fecha: F }, deps);
    expect(r).toEqual({ frame: 9, capsula: "personalidad-aurora-2026T4b.mv2e" });
    expect(llamadas.map((l) => l.url)).toEqual([
      `${BASE_MEMVID}/capsulas/personalidad-aurora-2026T4.mv2e/poner`,
      `${BASE_MEMVID}/capsulas/personalidad-aurora-2026T4b.mv2e/poner`,
    ]);
  });

  it("si el servidor no está devuelve null", async () => {
    expect(await poner(AURORA, "x", { fecha: F }, montar([() => { throw new Error("caído"); }]).deps)).toBeNull();
  });
});

describe("buscar, estado y línea", () => {
  it("buscar recorta a k, descarta aciertos sin texto y pide el tope", async () => {
    const { llamadas, deps } = montar([() => json({
      aciertos: [
        { titulo: "Café", texto: "planes del café", uri: "mv2://a", ts: 10 },
        { titulo: "Vacío", texto: "", uri: "mv2://b" },
        { titulo: "Otro", texto: "la compra", uri: "mv2://c" },
      ],
    })]);
    const r = await buscar("perfil-alex-2026T4.mv2e", "café", 2, deps);
    expect(r).toEqual([{ titulo: "Café", texto: "planes del café", uri: "mv2://a", ts: 10 }]);
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({ consulta: "café", k: 2 });
  });

  it("estado acepta los nombres del núcleo y calcula lo que queda", async () => {
    const { deps } = montar([() => json({ frame_count: 12, size_bytes: 1000, capacity_bytes: 5000 })]);
    expect(await estado("pagina-mundo-2026T4.mv2", deps)).toEqual({
      nombre: "pagina-mundo-2026T4.mv2", fotogramas: 12, bytes: 1000, topeBytes: 5000, quedaBytes: 4000,
    });
  });

  it("línea mapea el tiempo y devuelve null si no está", async () => {
    const { llamadas, deps } = montar([
      () => json({ linea: [{ frame_id: 3, timestamp: 99, preview: "hola", uri: "mv2://x" }] }),
      () => json({}, 404),
    ]);
    expect(await linea("capa-x-2026T4b.mv2e", 1, 100, deps)).toEqual([
      { frame: 3, ts: 99, titulo: "hola", uri: "mv2://x" },
    ]);
    expect(llamadas[0].url).toContain("/linea?desde=1&hasta=100");
    expect(await linea("capa-x-2026T4b.mv2e", undefined, undefined, deps)).toBeNull();
  });
});
