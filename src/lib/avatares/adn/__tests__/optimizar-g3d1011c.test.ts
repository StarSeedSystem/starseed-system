import { describe, it, expect } from "vitest";
import { pesoMB, problemasDelPlan, comprobarGlb, optimizar } from "../../../../../servicios/taller-3d/optimizar.mjs";

/* Pruebas puras del optimizador por destino (G3D1011C): sin red, sin GPU y sin disco
 * — el motor se simula y `escribir` solo recoge en memoria. */

/** GLB válido en memoria: firma «glTF», versión 2 y longitud que cuadra. */
const glbEnMemoria = (): Uint8Array => {
  const b = new Uint8Array(24);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.byteLength, true);
  return b;
};

type DocSim = { tri: number; bytes: number };
type MotorSim = {
  leer: (b: Uint8Array) => DocSim;
  triangulos: (d: DocSim) => number;
  soldar: (d: DocSim) => Promise<void>;
  redimensionar: (d: DocSim, px: number) => Promise<void>;
  quitarTexturas: (d: DocSim) => Promise<void>;
  atlas: (d: DocSim) => Promise<string[]>;
  escribir: (d: DocSim) => Promise<Uint8Array>;
  simplificar: (d: DocSim, ratio: number) => Promise<void>;
  meshopt: (d: DocSim) => Promise<void>;
};

interface Llamadas {
  soldar: number;
  meshopt: number;
  escritos: Array<string>;
}

const motorSimulado = (
  triBase: number,
  bytesNivel: number,
  llamadas: Llamadas,
): MotorSim => ({
  leer: () => ({ tri: triBase, bytes: triBase * 40 }),
  triangulos: (d) => d.tri,
  soldar: () => { llamadas.soldar += 1; return Promise.resolve(); },
  redimensionar: () => Promise.resolve(),
  quitarTexturas: () => Promise.resolve(),
  atlas: () => Promise.resolve([]),
  escribir: (d) => Promise.resolve(new Uint8Array(d.bytes)),
  simplificar: (d, ratio) => { d.tri = Math.max(1, Math.round(triBase * ratio)); d.bytes = bytesNivel; return Promise.resolve(); },
  meshopt: () => { llamadas.meshopt += 1; return Promise.resolve(); },
});

describe("optimizar.mjs · optimizador por destino (G3D1011C)", () => {
  /** Plan base válido; `extra` lo rompe campo a campo (los objetos pasan como `unknown`, sin `any`). */
  const planRoto = (extra: Record<string, unknown>) => ({
    destino: "bot",
    lods: [4000, 1000] as number[],
    texturaPx: 512,
    compresion: "meshopt",
    atlas: true,
    conservarOriginal: true,
    pesoMaxMB: 10,
    ...extra,
  });
  const planBase = planRoto({});

  it("el plan válido no da problemas y cada regla rota da su texto", () => {
    expect(problemasDelPlan(planBase)).toEqual([]);
    expect(problemasDelPlan(null)).toContain("el plan no es un objeto JSON");
    expect(problemasDelPlan(planRoto({ lods: [] })).some((t: string) => t.includes("«lods»"))).toBe(true);
    expect(problemasDelPlan(planRoto({ lods: [1000, 4000] })).some((t: string) => t.includes("de mayor a menor"))).toBe(true);
    expect(problemasDelPlan(planRoto({ lods: [4000, 4000.5] })).some((t: string) => t.includes("triángulos enteros positivos"))).toBe(true);
  });

  it("texturaPx, compresión, atlas, conservarOriginal y pesoMaxMB se validan", () => {
    expect(problemasDelPlan(planRoto({ texturaPx: -1 })).some((t: string) => t.includes("«texturaPx»"))).toBe(true);
    expect(problemasDelPlan(planRoto({ compresion: "zip" })).some((t: string) => t.includes("«compresion»"))).toBe(true);
    expect(problemasDelPlan(planRoto({ atlas: "sí" })).some((t: string) => t.includes("«atlas»"))).toBe(true);
    expect(problemasDelPlan(planRoto({ conservarOriginal: 1 })).some((t: string) => t.includes("conservarOriginal"))).toBe(true);
    expect(problemasDelPlan(planRoto({ pesoMaxMB: 0 })).some((t: string) => t.includes("«pesoMaxMB»"))).toBe(true);
  });

  it("pesoMB redondea a 3 decimales y el MiB es 1 048 576 bytes", () => {
    expect(pesoMB(0)).toBe(0);
    expect(pesoMB(1048576)).toBe(1);
    expect(pesoMB(1572864)).toBe(1.5);
    expect(pesoMB(1)).toBe(0);
  });

  it("comprobarGlb valida en memoria firma, versión y longitud (simula un GLB y ni lo escribe ni ensucia disco)", () => {
    expect(() => comprobarGlb(glbEnMemoria())).not.toThrow();
    const malPlan = glbEnMemoria();
    new DataView(malPlan.buffer).setUint32(0, 0x12345678, true);
    expect(() => comprobarGlb(malPlan)).toThrow(/no es un GLB/);
    const viejo = glbEnMemoria();
    new DataView(viejo.buffer).setUint32(4, 1, true);
    expect(() => comprobarGlb(viejo)).toThrow(/glTF 2\.0/);
    const cortado = glbEnMemoria().slice(0, 12);
    expect(() => comprobarGlb(cortado)).toThrow(/no es un GLB/);
    expect(() => comprobarGlb(new Uint8Array(10))).toThrow(/no es un GLB/);
  });

  it("optimizar escribe lods, original y manifiesto con un motor simulado (sin red ni GPU)", async () => {
    const llamadas: Llamadas = { soldar: 0, meshopt: 0, escritos: [] };
    const escribir = (nombre: string, datos: Uint8Array | string) => { llamadas.escritos.push(nombre); return Promise.resolve(); };
    const manifiesto = await optimizar({ glb: glbEnMemoria(), plan: planBase, motor: motorSimulado(20000, 500000, llamadas), escribir });
    expect(manifiesto.destino).toBe("bot");
    expect(manifiesto.lods.map((l: { triangulos: number }) => l.triangulos)).toEqual([4000, 1000]);
    expect(manifiesto.original?.triangulos).toBe(20000);
    expect(manifiesto.compresion).toBe("meshopt");
    expect(llamadas.soldar).toBe(1);
    expect(llamadas.meshopt).toBe(2); // uno por nivel
    expect(llamadas.escritos).toEqual(["lod0.glb", "lod1.glb", "original.glb", "manifiesto.json"]);
  });

  it("optimizar respeta conservarOriginal: sin él no escribe original.glb", async () => {
    const llamadas: Llamadas = { soldar: 0, meshopt: 0, escritos: [] };
    const escribir = (nombre: string) => { llamadas.escritos.push(nombre); return Promise.resolve(); };
    await optimizar({ glb: glbEnMemoria(), plan: { ...planBase, conservarOriginal: false }, motor: motorSimulado(20000, 500000, llamadas), escribir });
    expect(llamadas.escritos).toEqual(["lod0.glb", "lod1.glb", "manifiesto.json"]);
  });

  it("un nivel que excede el peso máximo lanza el error y no escribe nada (validarPesoMax de hoy)", async () => {
    const llamadas: Llamadas = { soldar: 0, meshopt: 0, escritos: [] };
    const escribir = (nombre: string) => { llamadas.escritos.push(nombre); return Promise.resolve(); };
    // planBase.pesoMaxMB = 10 pero el simulado hace que cada nivel pese 0.477 MB… así que clamamos el límite:
    await expect(
      optimizar({ glb: glbEnMemoria(), plan: { ...planBase, pesoMaxMB: 0.2 }, motor: motorSimulado(20000, 500000, llamadas), escribir }),
    ).rejects.toThrow(/permite 0\.2 MB|no se ha escrito nada/);
    expect(llamadas.escritos).toEqual([]); // nada escrito: ni lods, ni original, ni manifiesto
  });

  it("con el plan roto lanza «Plan de optimización no válido» con los problemas listados", async () => {
    const llamadas: Llamadas = { soldar: 0, meshopt: 0, escritos: [] };
    const escribir = (nombre: string) => { llamadas.escritos.push(nombre); return Promise.resolve(); };
    await expect(
      optimizar({ glb: glbEnMemoria(), plan: { ...planBase, pesoMaxMB: 0 }, motor: motorSimulado(20000, 500000, llamadas), escribir }),
    ).rejects.toThrow(/Plan de optimización no válido/);
    expect(llamadas.escritos).toEqual([]);
  });
});
