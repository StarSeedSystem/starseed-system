import { describe, it, expect } from "vitest";
import { comprobarGlb, optimizar, problemasDelPlan } from "../../../../../servicios/taller-3d/optimizar.mjs";

/**
 * Pruebas rescatadas de la rama `nube/a1-20261011-044923-G3D1011C`, adaptadas a la API de HOY de
 * `servicios/taller-3d/optimizar.mjs` (contrato: architecture/astraura-avatares-3d.md §11): la rama
 * probaba `parseArgs`/`escribirManifiesto`/`validarPesoMax`, contratos que main cambió a propósito.
 * Hoy la validación es `problemasDelPlan`, el manifiesto sale del callback `escribir` dentro de
 * `optimizar` y el peso se aplica antes de escribir NADA. Todo en memoria: sin red, sin disco ni GPU.
 */

/** GLB en memoria: firma «glTF», versión 2 y longitud total = su tamaño. */
const glbValido = (tamanio = 32): Uint8Array => {
  const b = new Uint8Array(tamanio);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, tamanio, true);
  return b;
};

type Doc = { tris: number; soldado: boolean };
type Escritos = Map<string, Uint8Array | string>;

/** Plan válido: dos niveles por debajo de los 32 triángulos del GLB. */
const planValido = () => ({
  destino: "bot",
  lods: [24, 12],
  texturaPx: 256,
  compresion: "ninguna",
  atlas: false,
  conservarOriginal: true,
  pesoMaxMB: 1,
});

/** Motor simulado: cada doc lleva su número de triángulos y los bytes que escribe
 *  son un Uint8Array de longitud = triángulos (o engordado, para romper el peso). */
const motorSimulado = (bytesPorDoc: (tris: number) => number = (tris) => tris) => {
  const escritos: Escritos = new Map();
  const escribir = async (nombre: string, datos: Uint8Array | string) => {
    escritos.set(nombre, datos);
  };
  const motor = {
    leer: async (b: Uint8Array | Doc) => (b instanceof Uint8Array ? { tris: b.byteLength, soldado: false } : { ...b }),
    triangulos: (d: Doc) => d.tris,
    soldar: async (d: Doc) => {
      d.soldado = true;
    },
    simplificar: async (d: Doc, ratio: number) => {
      d.tris = Math.floor(d.tris * ratio);
    },
    redimensionar: async () => {},    quitarTexturas: async () => {},
    atlas: async () => [] as string[],
    meshopt: async () => {},
    escribir: async (d: Doc) => new Uint8Array(bytesPorDoc(d.tris)),
  };
  return { escritos, escribir, motor };
};

type Nivel = { triangulos: number; objetivo: number; archivo: string; pesoMB: number };
type Manifiesto = { destino: string; compresion: string; texturaPx: number; atlas: boolean;
  lods: Nivel[]; original?: { archivo: string; triangulos: number; pesoMB: number }; avisos: string[] };

describe("optimizador por destino (rescate G3D1011C, API de hoy)", () => {
  it("problemasDelPlan dice cada campo mal y limpia un plan válido", () => {
    expect(problemasDelPlan(planValido())).toEqual([]);
    const fatales = problemasDelPlan({} as Record<string, unknown>);
    expect(fatales).toHaveLength(5);
    for (const campo of ["lods", "texturaPx", "compresion", "atlas", "pesoMaxMB"]) {
      expect(fatales.join(" ")).toContain(campo);
    }
    expect(problemasDelPlan({ ...planValido(), lods: [12, 24] }).join(" ")).toContain("lods");
  });

  it("comprobarGlb acepta la cabecera correcta y rechaza firma, versión y longitud rotas", () => {
    expect(() => comprobarGlb(glbValido())).not.toThrow();
    const firma = glbValido();
    new DataView(firma.buffer).setUint32(0, 0x12345678, true);
    expect(() => comprobarGlb(firma)).toThrow(/firma/);
    const vieja = glbValido();
    new DataView(vieja.buffer).setUint32(4, 1, true);
    expect(() => comprobarGlb(vieja)).toThrow(/glTF 2.0/);
    const corta = glbValido();
    new DataView(corta.buffer).setUint32(8, 999, true);
    expect(() => comprobarGlb(corta)).toThrow(/cortado|sobran/);
  });

  it("optimizar aplica el plan en memoria y escribe lods, original y manifiesto (sin red ni GPU)", async () => {
    const { escritos, escribir, motor } = motorSimulado();
    const manifiesto = await optimizar({ glb: glbValido(), plan: planValido(), motor, escribir });
    // Se escribe exactamente lo previsto, y ni antes ni fuera de ese orden.
    expect([...escritos.keys()]).toEqual(["lod0.glb", "lod1.glb", "original.glb", "manifiesto.json"]);
    expect(manifiesto.destino).toBe("bot");
    expect(manifiesto.compresion).toBe("ninguna");
    expect(manifiesto.atlas).toBe(false);
    expect(manifiesto.texturaPx).toBe(256);
    expect(manifiesto.lods.map((l) => l.archivo)).toEqual(["lod0.glb", "lod1.glb"]);
    expect(manifiesto.lods.map((l) => [l.triangulos, l.objetivo])).toEqual([
      [24, 24],
      [12, 12],
    ]);
    expect(manifiesto.avisos).toEqual([]);
    expect(manifiesto.original).toEqual({ archivo: "original.glb", triangulos: 32, pesoMB: 0 });
    // El manifiesto también sale por el callback `escribir`, con los mismos niveles.
    const delArchivo = JSON.parse(escritos.get("manifiesto.json") as string) as Manifiesto;
    expect(delArchivo.lods.map((l) => l.triangulos)).toEqual([24, 12]);
    expect(delArchivo.destino).toBe("bot");
  });

  it("optimizar no escribe NADA si un nivel excede pesoMaxMB (y lo dice en el error)", async () => {
    // Bytes engordados: el nivel 0 pesa ~2 MB, sobre el 1 MB del plan «bot».
    const { escritos, escribir, motor } = motorSimulado((tris) => tris + 2097152);
    const error = await optimizar({ glb: glbValido(), plan: planValido(), motor, escribir }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("no se ha escrito nada");
    expect(escritos.size).toBe(0);
  });
});
