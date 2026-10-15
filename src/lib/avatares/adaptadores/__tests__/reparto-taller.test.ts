/**
 * Taller 3D · pruebas del reparto entre neuronas (G3D1011D). PURO: sin red, sin disco, sin GPU.
 */
import { describe, expect, it } from "vitest";
import {
  analizarCapacidades, capacidadesDeRegistro, capacidadesParaRegistro, elegirNeurona, fidelidadDelPlan,
  hierroDeCapacidades, neuronaTallerDeLatido, planParaNeurona,
  vinculo, type EncargoTaller, type NeuronaTaller,
} from "../reparto-taller";
import type { Hierro } from "../../adn/optimizacion";

const MAC8: Hierro = { gpu: "apple", ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false };
const MAC32: Hierro = { ...MAC8, ramGB: 32 };
const A1: Hierro = { gpu: "ninguna", ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false };
const NVIDIA16: Hierro = { gpu: "nvidia", ramGB: 64, vramGB: 16, blender: true, permiteEspacioHf: false, claveExterna: false };

function neurona(id: string, hierro: Hierro | null, extra: Partial<NeuronaTaller> = {}): NeuronaTaller {
  return { id, cuenta: "alex", ofrecidaPor: [], hierro, carga: 0, viva: true, ...extra };
}

/** Generar un avatar desde una imagen: no hay salida sin GPU seria o Mac de 32 GB. */
const ENCARGO_AVATAR: EncargoTaller = {
  destino: "avatar", partida: "imagen", esqueleto: "soma30", region: "US", comercial: false, cuenta: "alex",
};

describe("capacidades en el registro de neuronas", () => {
  it("publica el hierro con sus capacidades y se lee de vuelta", () => {
    const c = capacidadesParaRegistro(NVIDIA16);
    expect(c.version).toBe(1);
    expect(c.capacidades).toContain("cuda-16gb");
    expect(capacidadesDeRegistro({ capacidades_taller: c })).toEqual(c);
  });

  it("la Mac de 8 GB y la A1 no anuncian generación", () => {
    for (const h of [MAC8, A1]) {
      const caps = capacidadesParaRegistro(h).capacidades;
      expect(caps).not.toContain("apple-silicon-32gb");
      expect(caps).not.toContain("cuda-16gb");
    }
  });

  it("rechaza latidos sin el bloque o de otra versión", () => {
    expect(capacidadesDeRegistro(null)).toBeNull();
    expect(capacidadesDeRegistro({})).toBeNull();
    expect(capacidadesDeRegistro({ capacidades_taller: { version: 99, hierro: MAC8, capacidades: [] } })).toBeNull();
    expect(capacidadesDeRegistro({ capacidades_taller: "cualquier cosa" })).toBeNull();
  });
});

describe("vínculo con la neurona", () => {
  it("propia > ofrecida > nada", () => {
    const e: EncargoTaller = { ...ENCARGO_AVATAR, grupos: ["semilla"] };
    expect(vinculo(neurona("a", MAC8), e)).toBe("propia");
    expect(vinculo(neurona("b", MAC8, { cuenta: "otra", ofrecidaPor: ["semilla"] }), e)).toBe("ofrecida");
    expect(vinculo(neurona("c", MAC8, { cuenta: "otra" }), e)).toBeNull();
  });
});

describe("elegirNeurona", () => {
  it("sin neuronas vivas lo dice claro", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("mac", MAC32, { viva: false })]);
    expect(r.neurona).toBeNull();
    expect(r.orden).toBeNull();
    expect(r.motivo).toContain("ninguna neurona viva");
  });

  it("si ninguna es de la cuenta ni ofrecida por sus grupos, no se lo da a una ajena", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("ajena", NVIDIA16, { cuenta: "otra" })]);
    expect(r.neurona).toBeNull();
    expect(r.motivo).toContain("tu grupo o comunidad");
  });

  it("la propia Mac de 8 GB no puede generar: lo dice explicando qué falta", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("mac-alex", MAC8)]);
    expect(r.neurona).toBeNull();
    expect(r.plan).toBeNull();
    expect(r.motivo).toContain("Ninguna neurona puede");
    expect(r.motivo).toMatch(/Mac Apple Silicon de 32 GB|NVIDIA de 16 GB|necesita/i);
  });

  it("si la propia no puede, se lo lleva la ofrecida por el grupo", () => {
    const r = elegirNeurona({ ...ENCARGO_AVATAR, grupos: ["semilla"] }, [
      neurona("mac-alex", MAC8),
      neurona("gpu-amiga", NVIDIA16, { cuenta: "vecina", ofrecidaPor: ["semilla"] }),
    ]);
    expect(r.neurona?.id).toBe("gpu-amiga");
    expect(r.plan?.listo).toBe(true);
    expect(r.motivo).toContain("ofreció tu grupo");
  });

  it("entre la propia y una ofrecida menos cargada, manda la propia", () => {
    const r = elegirNeurona({ ...ENCARGO_AVATAR, grupos: ["semilla"] }, [
      neurona("gpu-ajena", NVIDIA16, { cuenta: "vecina", ofrecidaPor: ["semilla"], carga: 0 }),
      neurona("gpu-propia", NVIDIA16, { carga: 5 }),
    ]);
    expect(r.neurona?.id).toBe("gpu-propia");
    expect(r.motivo).toContain("de tu cuenta");
  });

  it("la Mac de 32 GB genera pero no riggea (UniRig es solo NVIDIA): lo dice y no la elige para avatar", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("mac-32-propia", MAC32)]);
    expect(r.neurona).toBeNull();
    expect(r.motivo).toMatch(/UniRig|NVIDIA/);
  });

  it("entre dos propias que pueden, gana la de menos carga", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [
      neurona("gpu-ocupada", NVIDIA16, { carga: 3 }),
      neurona("gpu-libre", NVIDIA16, { carga: 0 }),
    ]);
    expect(r.neurona?.id).toBe("gpu-libre");
  });

  it("la orden viaja por el bus de órdenes de MetaGenesis, dirigida a la elegida", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("gpu", NVIDIA16)]);
    expect(r.orden).not.toBeNull();
    expect(r.orden?.bus).toBe("mg_orden");
    expect(r.orden?.para).toBe("gpu");
    expect(r.orden?.encargo.destino).toBe("avatar");
  });

  it("una neurona sin capacidades publicadas no estorba ni rompe la elección", () => {
    const r = elegirNeurona(ENCARGO_AVATAR, [neurona("muda", null), neurona("gpu", NVIDIA16)]);
    expect(r.neurona?.id).toBe("gpu");
    const solo = elegirNeurona(ENCARGO_AVATAR, [neurona("muda", null)]);
    expect(solo.motivo).toContain("no publicó sus capacidades");
  });

  it("optimizar una malla ya hecha para una pieza sí cabe en la A1 (CPU + Blender)", () => {
    const e: EncargoTaller = {
      destino: "pieza", partida: "malla", esqueleto: "ninguno", region: null, comercial: false, cuenta: "alex",
    };
    const r = elegirNeurona(e, [neurona("a1", A1)]);
    expect(r.neurona?.id).toBe("a1");
    expect(r.plan?.pasos.find((p) => p.etapa === "generar")?.saltada).toBe(true);
  });
});

describe("planParaNeurona", () => {
  it("aplaude la prioridad del destino y la carga del plan es medible", () => {
    const n = neurona("gpu", NVIDIA16);
    const plan = planParaNeurona(n, ENCARGO_AVATAR);
    expect(plan?.listo).toBe(true);
    expect(fidelidadDelPlan(plan!)).toBeGreaterThan(0);
    expect(planParaNeurona(neurona("muda", null), ENCARGO_AVATAR)).toBeNull();
  });
});

describe("conexión con el registro que ya existe", () => {
  it("hierroDeCapacidades no inventa: solo NVIDIA/Apple de la sonda, VRAM y Blender sin medir", () => {
    expect(hierroDeCapacidades({ platform: "macOS", gpuVendor: "Apple", gpuRenderer: "Apple M1", memoryGb: 8 }))
      .toEqual({ gpu: "apple", ramGB: 8, vramGB: null, blender: false, permiteEspacioHf: false, claveExterna: false });
    expect(hierroDeCapacidades({ platform: "Linux", gpuVendor: "NVIDIA Corporation", gpuRenderer: "RTX 4090", memoryGb: 64 }).gpu).toBe("nvidia");
    expect(hierroDeCapacidades({})).toMatchObject({ gpu: "ninguna", ramGB: 0 });
  });

  it("analizarCapacidades dice si genera y por qué no", () => {
    expect(analizarCapacidades({ platform: "macOS", gpuVendor: "Apple", memoryGb: 32 }).motivo).toBe("puede generar aquí");
    const mac8 = analizarCapacidades({ platform: "macOS", gpuVendor: "Apple", memoryGb: 8 });
    expect(mac8.capacidades).not.toContain("apple-silicon-32gb");
    expect(mac8.motivo).toContain("no puede generar aquí");
    expect(mac8.motivo).toContain("32 GB");
  });

  it("neuronaTallerDeLatido lee el bloque de una mg_latido y lo da listo para elegir", () => {
    const datos = { nodo: "mac-alex-01", capacidades_taller: capacidadesParaRegistro(NVIDIA16) };
    const n = neuronaTallerDeLatido(datos, { cuenta: "alex", viva: true, carga: 2 });
    expect(n).toMatchObject({ id: "mac-alex-01", cuenta: "alex", carga: 2, viva: true, hierro: NVIDIA16 });
    expect(elegirNeurona(ENCARGO_AVATAR, [n!]).neurona?.id).toBe("mac-alex-01");
    expect(neuronaTallerDeLatido({ nodo: "muda-01" })).toBeNull();
  });
});
