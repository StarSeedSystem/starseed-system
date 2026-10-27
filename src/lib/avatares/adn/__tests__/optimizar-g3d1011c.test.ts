import { describe, it, expect } from "vitest";
import { comprobarGlb, optimizar } from "../../../../../servicios/taller-3d/optimizar.mjs";

/* Rescate de pruebas de la rama nube/…RTG3D1011C (G3D1011C · optimizador por destino), ADAPTADAS al
 * API de hoy: los LODs, las texturas, el atlas y meshopt viven dentro de `optimizar({ glb, plan,
 * motor, escribir })` — todo en memoria y `escribir` solo se llama al final, cuando todo cupo.
 * Sin disco, sin red, sin GPU. No se prueba `parseArgs`: el CLI real es posicional por decisión de main. */

/** Cabecera GLB genuina: firma «glTF», versión 2 y longitud que cuadra con los bytes. */
const crearGlb = (tamanoBytes: number): Buffer => {
  const b = Buffer.alloc(tamanoBytes);
  b.writeUInt32LE(0x46546c67, 0);
  b.writeUInt32LE(2, 4);
  b.writeUInt32LE(tamanoBytes, 8);
  return b;
};

interface DocSim { tri: number }

/** Plan fiel a `planOptimizacion("bot")` (src/lib/avatares/adn/optimizacion.ts). */
type PlanSim = {
  destino: string;
  prioridad: "calidad" | "rapidez";
  generador: { resolucion: 512 | 1024 | 1536; pocaMemoria: boolean };
  remallado: { caras: number; modo: "organico" | "duro" } | null;
  lods: number[];
  texturaPx: number;
  compresion: "ninguna" | "meshopt";
  atlas: boolean;
  conservarOriginal: boolean;
  cerrada: boolean;
  pesoMaxMB: number;
};

const planSim = (cambias: Partial<PlanSim> = {}): PlanSim => ({
  destino: "bot", prioridad: "rapidez", generador: { resolucion: 512, pocaMemoria: false },
  remallado: { caras: 20_000, modo: "organico" }, lods: [1000, 500], texturaPx: 256,
  compresion: "meshopt", atlas: true, conservarOriginal: true, cerrada: true, pesoMaxMB: 5,
  ...cambias,
});

/** Grabador en memoria de lo que el optimizador pide escribir: nada toca disco. */
const crearEscrituras = () => {
  const escritas = new Map<string, string | Uint8Array>();
  const escribir = async (nombre: string, datos: string | Uint8Array): Promise<void> => {
    escritas.set(nombre, datos);
  };
  return { escritas, escribir };
};

/** Motor de mentiras en memoria, como el de crearMotorGltf: cuenta llamadas y simplifica según el plan. */
const crearMotorSim = (total: number, tamanoNivel: number) => {
  const llamadas = { soldar: 0, atlas: 0, meshopt: 0, redimPx: [] as number[], texturasQuitadas: 0 };
  return {
    llamadas,
    // Cada `leer` parte del soldado base (así lo hace el optimizador: menos error acumulado).
    leer: async (): Promise<DocSim> => ({ tri: total }),
    escribir: async (): Promise<Uint8Array> => Buffer.alloc(tamanoNivel),
    triangulos: (d: DocSim): number => d.tri,
    soldar: async (): Promise<void> => { llamadas.soldar += 1; },
    redimensionar: async (_d: DocSim, px: number): Promise<void> => { llamadas.redimPx.push(px); },
    quitarTexturas: async (): Promise<void> => { llamadas.texturasQuitadas += 1; },
    atlas: async (): Promise<string[]> => { llamadas.atlas += 1; return ["Atlas: material único escogido"]; },
    simplificar: async (d: DocSim, ratio: number): Promise<void> => {
      d.tri = Math.max(1, Math.round(d.tri * ratio));
    },
    meshopt: async (): Promise<void> => { llamadas.meshopt += 1; },
  };
};

describe("optimizador por destino (rescate RTG3D1011C · G3D1011C)", () => {
  it("comprobarGlb: GLB de mentira en memoria, por su firma, su versión y su longitud, sin pasar por /tmp", () => {
    expect(() => comprobarGlb(crearGlb(24))).not.toThrow();
    expect(() => comprobarGlb(Buffer.alloc(24))).toThrow("no es un GLB");
    const viejo = crearGlb(24);
    viejo.writeUInt32LE(1, 4);
    expect(() => comprobarGlb(viejo)).toThrow("solo se admite glTF 2.0");
    const cortado = crearGlb(24);
    cortado.writeUInt32LE(999, 8);
    expect(() => comprobarGlb(cortado)).toThrow("cortado o le sobran bytes");
  });

  it("aplica el plan según el destino: suelda, texturaPx, atlas, meshopt por nivel y LODs del plan", async () => {
    const plan = planSim({ conservarOriginal: true });
    const motor = crearMotorSim(1000, 1_000_000); // cada nivel pesa 0,954 MB
    const { escritas, escribir } = crearEscrituras();
    const glb = crearGlb(2_000_000); // 1,907 MB
    const manifiesto = (await optimizar({ glb, plan, motor, escribir })) as {
      destino: string; texturaPx: number; atlas: boolean; compresion: string;
      lods: { triangulos: number; objetivo: number; archivo: string; pesoMB: number }[];
      original: { archivo: string; triangulos: number; pesoMB: number };
      avisos: string[];
    };
    // El plan se aplica completo: sueldado una vez, texturas a 256 px, un atlas y meshopt por cada LOD.
    expect(motor.llamadas.soldar).toBe(1);
    expect(motor.llamadas.redimPx).toEqual([256]);
    expect(motor.llamadas.atlas).toBe(1);
    expect(motor.llamadas.meshopt).toBe(2);
    // Cada LOD sale del soldado base, no del anterior: nivel 0 va tal cual (ya cabía) y nivel 1 a la mitad.
    expect(manifiesto.destino).toBe("bot");
    expect(manifiesto.texturaPx).toBe(256);
    expect(manifiesto.atlas).toBe(true);
    expect(manifiesto.compresion).toBe("meshopt");
    expect(manifiesto.lods).toEqual([
      { triangulos: 1000, objetivo: 1000, archivo: "lod0.glb", pesoMB: 0.954 },
      { triangulos: 500, objetivo: 500, archivo: "lod1.glb", pesoMB: 0.954 },
    ]);
    expect(manifiesto.original).toEqual({ archivo: "original.glb", triangulos: 1000, pesoMB: 1.907 });
    // Avisos honestos: los del atlas, del nivel que no se simplica y de la cerrada sin medir.
    expect(manifiesto.avisos.some((a) => a.includes("Atlas"))).toBe(true);
    expect(manifiesto.avisos.some((a) => a.includes("va tal cual"))).toBe(true);
    expect(manifiesto.avisos.some((a) => a.includes("No se mide si la malla sigue cerrada"))).toBe(true);
    // Y lo escrito (en memoria): un GLB por LOD, el original SIN tocar y el manifiesto.json al final.
    expect([...escritas.keys()]).toEqual(["lod0.glb", "lod1.glb", "original.glb", "manifiesto.json"]);
    expect(escritas.get("original.glb")).toBe(glb);
    const delEscrito = JSON.parse(escritas.get("manifiesto.json") as string);
    expect(delEscrito.lods).toEqual(manifiesto.lods);
  });

  it("si un nivel supera pesoMaxMB no escribe NADA (el «validarPesoMax» de la rama, hoy dentro de optimizar)", async () => {
    const motor = crearMotorSim(1000, 3_145_728); // 3.000 MB exactos por nivel
    const { escritas, escribir } = crearEscrituras();
    await expect(
      optimizar({ glb: crearGlb(24), plan: planSim({ pesoMaxMB: 2 }), motor, escribir }),
    ).rejects.toThrow("no se ha escrito nada");
    expect(escritas.size).toBe(0);
  });
});
