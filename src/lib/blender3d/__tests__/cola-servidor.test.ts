import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { _ponerProcesos, capacidades, encolarTrabajo, estadoDe, leerSalida, listarRecientes } from "../cola-servidor";

const { guardianMando } = vi.hoisted(() => ({ guardianMando: vi.fn() }));
vi.mock("@/lib/mando/guardian", () => ({ guardianMando }));
import { GET, POST } from "@/app/api/3d/trabajos/route";

const hayBlender = (() => { try { return spawnSync("blender", ["--version"], { stdio: "ignore" }).status === 0; } catch { return false; } })();
const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1, titulo: "Cubo", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
  escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] }, { op: "luz", nombre: "sol", tipo: "sol", energia: 3 }],
  salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench" }], ...extra,
});
const fichaLigera = async () => ({ stdout: JSON.stringify({ instalado: true, version: "5.2.0", perfil: "ligero", motores: ["workbench"], gpu: [] }), stderr: "", code: 0 });
const raizOriginal = process.env.STARSEED_BLENDER_RAIZ;
let raiz = "", padre = "";
beforeEach(() => {
  padre = mkdtempSync(path.join(tmpdir(), "bld1025f-"));
  raiz = path.join(padre, "blender-3d");
  process.env.STARSEED_BLENDER_RAIZ = raiz;
  _ponerProcesos(null, null);
  guardianMando.mockReset();
});
afterEach(() => {
  _ponerProcesos(null, null);
  if (raizOriginal === undefined) delete process.env.STARSEED_BLENDER_RAIZ; else process.env.STARSEED_BLENDER_RAIZ = raizOriginal;
  rmSync(padre, { recursive: true, force: true });
});

describe("encolarTrabajo", () => {
  it("rechaza un trabajo inválido con motivos y no escribe nada", async () => {
    const r = await encolarTrabajo({ v: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos?.length ?? 0).toBeGreaterThan(0);
    expect(existsSync(raiz)).toBe(false);
  });
  it("pide confirmación para un trabajo pesado sin confirmar", async () => {
    _ponerProcesos(fichaLigera, () => undefined);
    const r = await encolarTrabajo(base({ ambito: "grupo" }));
    expect(r).toMatchObject({ ok: false, requiereConfirmacion: true });
    expect(existsSync(path.join(raiz, "cola"))).toBe(false);
  });
  it("rechaza ids con .. o de largo equivocado", async () => {
    expect(await estadoDe(`../${"0".repeat(32)}`)).toBeNull();
    expect(await estadoDe("0".repeat(31))).toBeNull();
    expect((await leerSalida("0".repeat(32), "../secreto")).ok).toBe(false);
  });
  it("encola y no filtra rutas absolutas en el estado ni en el listado", async () => {
    _ponerProcesos(fichaLigera, () => undefined);
    const r = await encolarTrabajo(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ficha = JSON.parse(readFileSync(path.join(raiz, "estado", `${r.id}.json`), "utf8")) as Record<string, unknown>;
    writeFileSync(path.join(raiz, "estado", `${r.id}.json`), JSON.stringify({ ...ficha, motivo: `falló en ${raiz}` }));
    const uno = JSON.stringify(await estadoDe(r.id));
    const todos = JSON.stringify(await listarRecientes());
    for (const texto of [uno, todos]) { expect(texto).not.toContain(raiz); expect(texto).not.toContain(tmpdir()); }
  });
  it("listarRecientes nunca devuelve más de 20 aunque se pidan 25", async () => {
    mkdirSync(path.join(raiz, "estado"), { recursive: true });
    for (let i = 0; i < 25; i++) {
      const id = i.toString(16).padStart(32, "0");
      writeFileSync(path.join(raiz, "estado", `${id}.json`), JSON.stringify({ id, estado: "en_cola", salidas: [] }));
    }
    const lista = await listarRecientes(25);
    expect(lista.length).toBe(20);
  });
  it("no arranca otro ejecutor si el cerrojo está vivo", async () => {
    mkdirSync(raiz, { recursive: true });
    writeFileSync(path.join(raiz, "ejecutor.lock"), String(process.pid));
    let lanzados = 0;
    _ponerProcesos(fichaLigera, () => { lanzados++; });
    const r = await encolarTrabajo(base());
    expect(r.ok).toBe(true);
    expect(lanzados).toBe(0);
  });
});

describe("capacidades", () => {
  it("devuelve null sin Blender", async () => {
    _ponerProcesos(async () => ({ stdout: '{"instalado":false}', stderr: "", code: 0 }), null);
    expect(await capacidades(true)).toBeNull();
  });
});

describe("ruta /api/3d/trabajos", () => {
  it("devuelve el veto del guardián sin tocar el disco", async () => {
    guardianMando.mockResolvedValue(new Response("no", { status: 404 }));
    const get = await GET(new Request("http://localhost/api/3d/trabajos"));
    const post = await POST(new Request("http://localhost/api/3d/trabajos", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect([get.status, post.status]).toEqual([404, 404]);
    expect(guardianMando).toHaveBeenCalledTimes(2);
    expect(existsSync(raiz)).toBe(false);
  });
});

describe.skipIf(!hayBlender)("punta a punta con Blender real", () => {
  it("un cubo llega a GLB y PNG de verdad", async () => {
    _ponerProcesos(null, null);
    const r = await encolarTrabajo(base({ salidas: [
      { tipo: "exportar_glb", y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
      { tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench" },
    ] }));
    expect(r.ok, r.ok ? "" : r.motivo ?? r.motivos?.join(" · ")).toBe(true);
    if (!r.ok) return;
    let estado = await estadoDe(r.id);
    for (let i = 0; i < 120 && estado && !["hecho", "error", "cancelado"].includes(estado.estado); i++) {
      await new Promise((s) => setTimeout(s, 500));
      estado = await estadoDe(r.id);
    }
    expect(estado?.estado).toBe("hecho");
    const glb = estado?.salidas.find((n) => n.endsWith(".glb"));
    const png = estado?.salidas.find((n) => n.endsWith(".png"));
    if (!glb || !png) throw new Error(`faltan salidas: ${String(estado?.salidas)}`);
    const g = await leerSalida(r.id, glb), p = await leerSalida(r.id, png);
    if (!g.ok || !p.ok) throw new Error("no se pudieron leer las salidas");
    expect(new TextDecoder().decode(g.bytes.slice(0, 4))).toBe("glTF");
    expect([...p.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 120_000);
});
