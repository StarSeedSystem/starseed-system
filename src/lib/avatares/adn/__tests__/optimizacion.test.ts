import { describe, expect, it } from "vitest";
import { planificar } from "../canalizacion";
import { DESTINOS_3D, capacidadesDe, lodPara, planOptimizacion, resolucionPara, siguienteIntento, type Hierro } from "../optimizacion";

const hierro = (o: Partial<Hierro> = {}): Hierro => ({ gpu: "ninguna", ramGB: 8, vramGB: null, blender: false, permiteEspacioHf: false, claveExterna: false, ...o });

describe("optimización por destino", () => {
  it("la Protomolécula conserva el original sin remallar; avatar, bot y pieza se remallan", () => {
    expect(planOptimizacion("protomolecula").remallado).toBeNull();
    expect(planOptimizacion("protomolecula").conservarOriginal).toBe(true);
    for (const d of ["avatar", "bot", "pieza"] as const) expect(planOptimizacion(d).remallado).not.toBeNull();
  });
  it("los LOD van de mayor a menor y el peso máximo baja con el destino", () => {
    for (const d of DESTINOS_3D) {
      const l = planOptimizacion(d).lods;
      expect([...l].sort((a, b) => b - a)).toEqual(l);
    }
    const pesos = DESTINOS_3D.map((d) => planOptimizacion(d).pesoMaxMB);
    expect(pesos).toEqual([...pesos].sort((a, b) => b - a));
  });
  it("un avatar trae un LOD por nivel de XR y se elige el que cabe", () => {
    const p = planOptimizacion("avatar");
    expect(p.lods).toEqual([120_000, 60_000, 25_000, 10_000]);
    expect(lodPara(p, "vrm-completo")).toBe(0);
    expect(lodPara(p, "vrm-ligero")).toBe(2);
    expect(lodPara(p, "orbe-manos")).toBe(3);
  });
  it("resolución según la GPU: 1536 solo con 24 GB; poca memoria por debajo de 16 GB", () => {
    expect(resolucionPara("protomolecula", 24)).toEqual({ resolucion: 1536, pocaMemoria: false });
    expect(resolucionPara("protomolecula", 16)).toEqual({ resolucion: 1024, pocaMemoria: false });
    expect(resolucionPara("avatar", 12)).toEqual({ resolucion: 1024, pocaMemoria: true });
    expect(resolucionPara("bot", 12)).toEqual({ resolucion: 512, pocaMemoria: true });
  });
  it("si se queda sin memoria: primero modo de poca memoria, luego baja la resolución, y al final se rinde", () => {
    let p = planOptimizacion("protomolecula", 24);
    p = siguienteIntento(p, "sin-memoria")!;
    expect(p.generador).toEqual({ resolucion: 1536, pocaMemoria: true });
    p = siguienteIntento(p, "sin-memoria")!;
    expect(p.generador.resolucion).toBe(1024);
    p = siguienteIntento(p, "lento")!;
    expect(p.generador.resolucion).toBe(512);
    expect(siguienteIntento(p, "sin-memoria")).toBeNull();
  });
});

describe("hierro → requisitos del taller", () => {
  it("la Mac de 8 GB y la A1 solo ofrecen CPU (y Blender si está)", () => {
    expect(capacidadesDe(hierro({ gpu: "apple", ramGB: 8 }))).toEqual(["cpu"]);
    expect(capacidadesDe(hierro({ ramGB: 24, blender: true }))).toEqual(["cpu", "blender"]);
  });
  it("Mac de 32 GB y NVIDIA de 16 GB", () => {
    expect(capacidadesDe(hierro({ gpu: "apple", ramGB: 32 }))).toContain("apple-silicon-32gb");
    expect(capacidadesDe(hierro({ gpu: "nvidia", ramGB: 32, vramGB: 16 }))).toEqual(["cpu", "cuda-8gb", "cuda-16gb"]);
  });
  it("el Space de Hugging Face solo si la persona lo permitió", () => {
    expect(capacidadesDe(hierro())).not.toContain("espacio-hf");
    expect(capacidadesDe(hierro({ permiteEspacioHf: true }))).toContain("espacio-hf");
  });
});

describe("plan completo: destino + hierro", () => {
  const generar = (caps: ReturnType<typeof capacidadesDe>, prioridad: "calidad" | "rapidez") =>
    planificar({ partida: "imagen", esqueleto: "libre", capacidades: caps, region: "MX", comercial: false, permitirDePago: false, prioridad })
      .pasos.find((x) => x.etapa === "generar")!;
  it("con NVIDIA de 16 GB: calidad → Pixal3D; rapidez → Stable Fast 3D", () => {
    const caps = capacidadesDe(hierro({ gpu: "nvidia", ramGB: 32, vramGB: 16 }));
    expect(generar(caps, "calidad").motor?.id).toBe("pixal3d");
    expect(generar(caps, "rapidez").motor?.id).toBe("stable-fast-3d");
  });
  it("con la Mac de 8 GB nada genera en local; con permiso, el Space de Pixal3D (remoto) sí", () => {
    expect(generar(capacidadesDe(hierro({ gpu: "apple" })), "calidad").motor).toBeNull();
    expect(generar(capacidadesDe(hierro({ gpu: "apple", permiteEspacioHf: true })), "calidad").motor?.id).toBe("pixal3d-espacio");
  });
  it("lo local va siempre antes que lo remoto", () => {
    const caps = capacidadesDe(hierro({ gpu: "nvidia", ramGB: 32, vramGB: 16, permiteEspacioHf: true }));
    expect(generar(caps, "calidad").motor?.id).toBe("pixal3d");
  });
  it("Mac de 32 GB en México: calidad → TRELLIS.2 (en local)", () => {
    expect(generar(capacidadesDe(hierro({ gpu: "apple", ramGB: 32 })), "calidad").motor?.id).toBe("trellis2");
  });
});
