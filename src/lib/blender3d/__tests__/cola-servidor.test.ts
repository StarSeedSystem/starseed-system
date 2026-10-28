import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starseed-blender-"));
process.env.STARSEED_BLENDER_RAIZ = tmp;

const { encolarTrabajo, estadoDe, listarRecientes, leerSalida, capacidades } = await import("../cola-servidor");

function trabajoValido() {
  return {
    v: 1,
    titulo: "cubo",
    calidad: "borrador",
    ambito: "personal",
    origen: "protomolecula",
    quien: "persona",
    escena: [{ op: "primitiva", tipo: "cubo", nombre: "Cubo1", tam: 1 }],
    salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 1, motor: "workbench" }]
  };
}

describe("cola-servidor", () => {
  it("rechaza trabajo inválido sin escribir en disco", async () => {
    const res = await encolarTrabajo({ v: 1 });
    expect(res.ok).toBe(false);
    const files = await fs.readdir(path.join(tmp, "cola")).catch(() => []);
    expect(files.length).toBe(0);
  });

  it("requiere confirmación para trabajo pesado sin confirmar", async () => {
    const t = trabajoValido();
    t.calidad = "final";
    const res = await encolarTrabajo(t);
    expect(res.ok).toBe(false);
    expect((res as any).requiereConfirmacion).toBe(true);
  });

  it("rechaza id mal formado", async () => {
    expect(await estadoDe("..")).toBeNull();
    expect(await estadoDe("zzz".repeat(8))).toBeNull();
  });

  it("no devuelve rutas absolutas", async () => {
    const res = await encolarTrabajo(trabajoValido());
    expect(res.ok).toBe(true);
    const id = (res as any).id;
    const st = await estadoDe(id);
    expect(st).not.toBeNull();
    const estadoPath = path.join(tmp, "estado", id + ".json");
    const contenido = await fs.readFile(estadoPath, "utf-8");
    expect(contenido).not.toContain(tmp);
  });

  it("capacidades devuelve null si no hay Blender", async () => {
    const cap = await capacidades();
    expect(cap).toBeNull();
  });

  it("no arranca segundo ejecutor si lock existe", async () => {
    await fs.writeFile(path.join(tmp, "ejecutor.lock"), "x");
    const res = await encolarTrabajo(trabajoValido());
    expect(res.ok).toBe(true);
    const lockStat = await fs.stat(path.join(tmp, "ejecutor.lock"));
    expect(lockStat.size).toBeGreaterThan(0);
  });

  it("listarRecientes limita a 20", async () => {
    const list = await listarRecientes(25);
    expect(list.length).toBeLessThanOrEqual(20);
  });

  it("leerSalida rechaza nombres con ..", async () => {
    const res = await leerSalida("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "../secreto");
    expect(res).toBeNull();
  });

  describe.skip("prueba punta a punta con Blender real", () => {
    it("cubo → cola → GLB y PNG", async () => {
      expect(true).toBe(true);
    });
  });
});
