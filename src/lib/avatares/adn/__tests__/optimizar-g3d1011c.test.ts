import { describe, it, expect } from "vitest";
import {
  comprobarGlb,
  optimizar,
  pesoMB,
  problemasDelPlan,
} from "../../../../../servicios/taller-3d/optimizar.mjs";

/** Rescate de la rama nube/a1-20261011-044923-G3D1011C, adaptado a la API de hoy:
 *  los casos de «validarPesoMax» y «escribirManifiesto» van contra `optimizar`,
 *  que ya guarda el contrato (nada se escribe si un nivel excede «pesoMaxMB»,
 *  y el manifiesto sale por «escribir»). Sin red, sin GPU, motor simulado. */

const glbValido = (tamano = 4000): Uint8Array => {
  // 4004 bytes ≈ 1000 «triángulos» a 4 bytes en el motor simulado.
  const b = new Uint8Array(tamano);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x46546c67, true); // firma «glTF»
  v.setUint32(4, 2, true); // glTF 2.0
  v.setUint32(8, tamano, true); // longitud total
  return b;
};

const plan = (pesoMaxMB = 1) => ({
  destino: "bot",
  lods: [500, 250],
  texturaPx: 0,
  compresion: "ninguna" as const,
  atlas: false,
  cerrada: false,
  conservarOriginal: true,
  pesoMaxMB,
});

type Doc = { n: number };
const motorSimulado = () => ({
  leer: (b: Uint8Array): Doc => ({ n: Math.max(1, Math.round(b.byteLength / 4)) }),
  escribir: (d: Doc): Uint8Array => new Uint8Array(d.n * 4),
  triangulos: (d: Doc): number => d.n,
  soldar: async (d: Doc) => d,
  simplificar: async (d: Doc, ratio: number) => {
    d.n = Math.max(1, Math.round(d.n * ratio));
    return d;
  },
  redimensionar: async (d: Doc) => d,
  quitarTexturas: async (d: Doc) => d,
  atlas: async (): Promise<string[]> => [],
  meshopt: async (d: Doc) => d,
});

const escribirEn = () => {
  const escritos: Array<{ nombre: string; datos: Uint8Array | string }> = [];
  return {
    escritos,
    fn: async (nombre: string, datos: Uint8Array | string) => {
      escritos.push({ nombre, datos });
    },
  };
};

describe("optimizar.mjs (rescate G3D1011C)", () => {
  it("pesoMB redondea a 3 decimales de MB", () => {
    expect(pesoMB(1048576)).toBe(1);
    expect(pesoMB(1_600_000)).toBe(1.526);
  });

  it("comprobarGlb: exige la firma «glTF», glTF 2.0 y una longitud que cuadre", () => {
    expect(() => comprobarGlb(new Uint8Array(24))).toThrow(/no es un GLB/);
    const malVersion = glbValido();
    new DataView(malVersion.buffer).setUint32(4, 3, true);
    expect(() => comprobarGlb(malVersion)).toThrow(/glTF 2\.0/);
    const cortado = new Uint8Array(20);
    const v = new DataView(cortado.buffer);
    v.setUint32(0, 0x46546c67, true);
    v.setUint32(4, 2, true);
    expect(() => comprobarGlb(cortado)).toThrow(/cortado/);
    expect(() => comprobarGlb(glbValido())).not.toThrow();
  });

  it("problemasDelPlan: plan válido vacío; plano roto con avisos en español", () => {
    expect(problemasDelPlan(plan())).toEqual([]);
    const mal = problemasDelPlan({ destino: "bot", lods: [100, 200], texturaPx: -1, compresion: "draco", atlas: "sí", conservarOriginal: 1, pesoMaxMB: 0 });
    expect(mal.length).toBeGreaterThanOrEqual(1);
    expect(mal.join(" ")).toMatch(/lods/);
    expect(mal.join(" ")).toMatch(/pesoMaxMB/);
  });

  it("optimizar: escribe los LOD, el original y el manifiesto.json sin red ni GPU", async () => {
    const s = escribirEn();
    const manifiesto = await optimizar({
      glb: glbValido(),
      plan: plan(),
      motor: motorSimulado(),
      escribir: s.fn,
    });
    const nombres = s.escritos.map((e) => e.nombre);
    expect(nombres).toContain("lod0.glb");
    expect(nombres).toContain("lod1.glb");
    expect(nombres).toContain("original.glb");
    expect(nombres).toContain("manifiesto.json");
    const manifiestoTxt = s.escritos.find((e) => e.nombre === "manifiesto.json")!.datos as string;
    const guardado = JSON.parse(manifiestoTxt) as { destino: string; lods: Array<{ triangulos: number }> };
    expect(guardado.destino).toBe("bot");
    expect(guardado.lods[0].triangulos).toBe(500); // 1000 · ratio 0,5
    expect(guardado.lods[1].triangulos).toBe(250); // 1000 · ratio 0,25
    expect(manifiesto.lods).toHaveLength(2);
    expect(manifiesto.original!.triangulos).toBe(1000);
  });

  it("optimizar: si un nivel excede «pesoMaxMB», lanza en español y no escribe nada", async () => {
    const s = escribirEn();
    let texto = "";
    try {
      await optimizar({ glb: glbValido(), plan: plan(0.001), motor: motorSimulado(), escribir: s.fn });
    } catch (e) {
      texto = (e as Error).message;
    }
    expect(texto).toMatch(/pesa \d/);
    expect(texto).toMatch(/permite/);
    expect(s.escritos).toEqual([]);
  });

  it("optimizar: un plan con lods vacíos no se acepta", async () => {
    const s = escribirEn();
    await expect(
      optimizar({ glb: glbValido(), plan: { ...plan(), lods: [] }, motor: motorSimulado(), escribir: s.fn }),
    ).rejects.toThrow(/no válido/);
    expect(s.escritos).toEqual([]);
  });

  it("optimizar: un GLB con la cabecera rota no llega al motor", async () => {
    const s = escribirEn();
    await expect(
      optimizar({ glb: new Uint8Array(24), plan: plan(), motor: motorSimulado(), escribir: s.fn }),
    ).rejects.toThrow(/no es un GLB/);
    expect(s.escritos).toEqual([]);
  });
});
