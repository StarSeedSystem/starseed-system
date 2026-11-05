import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("GET /api/mando/lanzamientos", () => {
  const originalHome = process.env.HOME;
  const originalRoot = process.env.STARSEED_ROOT;
  let homeTmp: string;

  beforeEach(async () => {
    homeTmp = await fs.mkdtemp(path.join(tmpdir(), "starseed-home-"));
    process.env.HOME = homeTmp;
    process.env.STARSEED_ROOT = process.cwd();
    await fs.mkdir(path.join(homeTmp, ".starseed", "produccion"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.STARSEED_ROOT = originalRoot;
    await fs.rm(homeTmp, { recursive: true, force: true });
  });

  it("devuelve estado vacío y auto por defecto", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auto).toBe(true);
    expect(Array.isArray(json.filas)).toBe(true);
    expect(json.filas).toHaveLength(9);
  });
  it("lee estado y auto desde disco", async () => {
    const prod = path.join(homeTmp, ".starseed", "produccion");
    await fs.writeFile(path.join(prod, "lanzamientos-estado.json"), JSON.stringify({
      fase: "lanzado",
      detalle: "",
      version: "0.3.0",
      pasos: [],
      jobs: [],
      medios: { macos: { estado: "al-dia", faltan: [], pequenos: [] } },
      historial: [],
      pausado: false,
      tono: "normal",
    }));
    await fs.writeFile(path.join(prod, "lanzamientos.json"), JSON.stringify({ auto: false }));

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost"));
    const json = await res.json();
    expect(json.auto).toBe(false);
    expect(json.estado.fase).toBe("lanzado");
    expect(json.filas.find((f: any) => f.id === "macos").estado).toBe("al-dia");
  });
});

describe("POST /api/mando/lanzamientos", () => {
  const originalHome = process.env.HOME;
  const originalRoot = process.env.STARSEED_ROOT;
  let homeTmp: string;

  beforeEach(async () => {
    homeTmp = await fs.mkdtemp(path.join(tmpdir(), "starseed-home-"));
    process.env.HOME = homeTmp;
    process.env.STARSEED_ROOT = process.cwd();
    await fs.mkdir(path.join(homeTmp, ".starseed", "produccion"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.STARSEED_ROOT = originalRoot;
    await fs.rm(homeTmp, { recursive: true, force: true });
  });

  it("guarda auto en lanzamientos.json", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ accion: "auto", activo: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const contenido = JSON.parse(await fs.readFile(path.join(homeTmp, ".starseed", "produccion", "lanzamientos.json"), "utf-8"));
    expect(contenido.auto).toBe(true);
  });

  it("regenerar web escribe autopublicar-peticion.json", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ accion: "regenerar", medio: "web" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const contenido = JSON.parse(await fs.readFile(path.join(homeTmp, ".starseed", "produccion", "autopublicar-peticion.json"), "utf-8"));
    expect(contenido.accion).toBe("revisar");
  });

  it("otras acciones escriben lanzamientos-peticion.json", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ accion: "lanzar" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const contenido = JSON.parse(await fs.readFile(path.join(homeTmp, ".starseed", "produccion", "lanzamientos-peticion.json"), "utf-8"));
    expect(contenido.accion).toBe("lanzar");
  });

  it("rechaza petición inválida", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ accion: "borrar" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
