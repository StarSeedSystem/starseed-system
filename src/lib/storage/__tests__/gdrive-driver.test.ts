/**
 * Driver de Google Drive (Ola 374) — forma de las peticiones REST, búsqueda
 * por `appProperties`, y backoff ante 429/5xx. Todo contra `fetch` simulado
 * (nunca toca la red ni Google de verdad).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actualizarArchivo,
  asegurarCarpeta,
  borrar,
  buscarPorPropiedades,
  probarDrive,
  subirArchivo,
} from "../gdrive-driver";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("probarDrive", () => {
  it("manda el Bearer token y devuelve el correo + cuota", async () => {
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/drive/v3/about");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN123");
      return new Response(JSON.stringify({ user: { emailAddress: "alex@example.com" }, storageQuota: { limit: "100", usage: "10" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probarDrive("TOKEN123");
    expect(r).toEqual({ ok: true, email: "alex@example.com", limiteBytes: 100, usoBytes: 10 });
  });

  it("401 → mensaje claro de reconectar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no autorizado", { status: 401 })));
    const r = await probarDrive("TOKEN-caducado");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/reconecta/i);
  });
});

describe("subirArchivo — cuerpo multipart", () => {
  it("construye un multipart/related con metadatos JSON + contenido, y appProperties para deduplicar", async () => {
    let cuerpoEnviado = "";
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("uploadType=multipart");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
      cuerpoEnviado = await new Response(init?.body as BodyInit).text();
      return new Response(JSON.stringify({ id: "file-1", name: "memory.md", modifiedTime: "2026-09-27T00:00:00Z" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await subirArchivo("TOKEN", {
      carpetaId: "folder-1",
      nombre: "memory.md",
      contenido: "# hola",
      appProperties: { brainId: "b1", memoryId: "m1" },
    });
    expect(r).toEqual({ ok: true, fileId: "file-1", modifiedTime: "2026-09-27T00:00:00Z" });
    // El cuerpo lleva las DOS partes: metadatos JSON con appProperties, y el contenido.
    expect(cuerpoEnviado).toContain('"appProperties":{"brainId":"b1","memoryId":"m1"}');
    expect(cuerpoEnviado).toContain('"parents":["folder-1"]');
    expect(cuerpoEnviado).toContain("# hola");
    expect(cuerpoEnviado).toContain("Content-Type: application/json");
    expect(cuerpoEnviado).toContain("Content-Type: text/markdown");
  });
});

describe("actualizarArchivo", () => {
  it("PATCH de media (sin metadatos) al fileId dado", async () => {
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/upload/drive/v3/files/file-9?uploadType=media");
      expect(init?.method).toBe("PATCH");
      expect(await new Response(init?.body as BodyInit).text()).toBe("contenido nuevo");
      return new Response(JSON.stringify({ id: "file-9", modifiedTime: "2026-09-27T01:00:00Z" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await actualizarArchivo("TOKEN", "file-9", "contenido nuevo");
    expect(r).toEqual({ ok: true, modifiedTime: "2026-09-27T01:00:00Z" });
  });
});

describe("buscarPorPropiedades", () => {
  it("arma la cláusula `q` con appProperties has {...} y filtra carpetas/trashed", async () => {
    const fetchFalso = vi.fn(async (url: string) => {
      const q = new URL(String(url)).searchParams.get("q") || "";
      expect(q).toContain("appProperties has { key='brainId' and value='b1' }");
      expect(q).toContain("appProperties has { key='memoryId' and value='m1' }");
      expect(q).toContain("trashed=false");
      expect(q).toContain("'folder-1' in parents");
      return new Response(JSON.stringify({ files: [{ id: "file-1", name: "memory.md" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await buscarPorPropiedades("TOKEN", { brainId: "b1", memoryId: "m1" }, { carpetaId: "folder-1" });
    expect(r.ok).toBe(true);
    expect(r.archivos).toEqual([{ id: "file-1", name: "memory.md" }]);
  });

  it("escapa comillas simples en los valores (evita romper la cláusula q)", async () => {
    const fetchFalso = vi.fn(async (url: string) => {
      const q = new URL(String(url)).searchParams.get("q") || "";
      expect(q).toContain("value='no es\\'un ataque'");
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    await buscarPorPropiedades("TOKEN", { osPath: "no es'un ataque" });
  });
});

describe("asegurarCarpeta", () => {
  it("reutiliza la carpeta si ya existe (no la vuelve a crear)", async () => {
    const llamadas: string[] = [];
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push(init?.method || "GET");
      if ((init?.method || "GET") === "GET") {
        return new Response(JSON.stringify({ files: [{ id: "existing-1", name: "StarSeed" }] }), { status: 200 });
      }
      throw new Error("no debería crear si ya existe");
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await asegurarCarpeta("TOKEN", ["StarSeed"]);
    expect(r).toEqual({ ok: true, folderId: "existing-1" });
    expect(llamadas).toEqual(["GET"]);
  });

  it("crea cada nivel que falte y encadena los ids como padres", async () => {
    const creadas: Record<string, unknown>[] = [];
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method || "GET";
      if (metodo === "GET") return new Response(JSON.stringify({ files: [] }), { status: 200 }); // nada existe
      const body = JSON.parse(String(init?.body));
      creadas.push(body);
      return new Response(JSON.stringify({ id: `folder-${creadas.length}`, name: body.name }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await asegurarCarpeta("TOKEN", ["StarSeed", "cerebros", "Mi cerebro"]);
    expect(r).toEqual({ ok: true, folderId: "folder-3" });
    expect(creadas).toHaveLength(3);
    expect(creadas[0].parents).toEqual(["root"]);
    expect(creadas[1].parents).toEqual(["folder-1"]);
    expect(creadas[2].parents).toEqual(["folder-2"]);
    expect(creadas[2].appProperties).toEqual({ starseedRuta: "StarSeed/cerebros/Mi cerebro" });
  });
});

describe("borrar", () => {
  it("404 se trata como éxito (el resultado deseado ya se cumple)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await borrar("TOKEN", "file-x")).toEqual({ ok: true });
  });
});

describe("backoff ante 429/5xx", () => {
  it("reintenta hasta 3 veces con espera creciente y al final devuelve éxito", async () => {
    vi.useFakeTimers();
    let intentos = 0;
    const fetchFalso = vi.fn(async () => {
      intentos++;
      if (intentos < 3) return new Response("sobrecargado", { status: 429 });
      return new Response(JSON.stringify({ user: { emailAddress: "ok@example.com" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const promesa = probarDrive("TOKEN");
    // Deja correr los `setTimeout` del backoff sin esperar tiempo real.
    await vi.runAllTimersAsync();
    const r = await promesa;
    expect(intentos).toBe(3);
    expect(r.ok).toBe(true);
  });

  it("no reintenta un 400 (error del cliente, no transitorio)", async () => {
    const fetchFalso = vi.fn(async () => new Response("petición inválida", { status: 400 }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probarDrive("TOKEN");
    expect(r.ok).toBe(false);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
