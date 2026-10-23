/**
 * Pruebas del adaptador WebGPU de SD-Turbo · IMG1011H, parte 3 de 3. Todo puro: sin red, sin GPU,
 * sin descargas de pesos — el motor se SIMULA y el flujo se comprueba paso a paso. Contrato:
 * architecture/astraura-imagenes.md §1 (licencia de SD-Turbo «sin comprobar del todo» en el catálogo),
 * §3 (la pestaña es una capa más, con WebGPU) y §8 (nada se descarga sin permiso y con el triple de
 * espacio libre; sin WebGPU se dice y se usan las demás capas).
 */
import { describe, expect, it } from "vitest";
import {
  BYTES_PESOS_SD_TURBO,
  MODELO_SD_TURBO,
  PESOS_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB,
  detectaSDTurbo,
  generaEnPestana,
  planPesos,
  textoBytes,
  type ImagenSDTurbo,
  type MotorSDTurbo,
  type PeticionSDTurbo,
  type SondasWebGPU,
} from "../webgpu-sd-turbo";
import { MOTORES, modeloPorId } from "../../modelos";

const GB = 1024 ** 3;
const BUENAS: SondasWebGPU = { hayWebGPU: true, hayAdaptador: true, f16: true };
const PETICION: PeticionSDTurbo = { prompt: "un faro en la niebla", semilla: 7, permisoDescarga: true };
const IMAGEN: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: MODELO_SD_TURBO };

interface Ajuste {
  sondas?: Partial<SondasWebGPU>;
  yaEnCache?: boolean;
  cuotaLibre?: number | null;
  fallaDescarga?: string;
  fallaGeneracion?: unknown;
}

/** Motor simulado: determinista, sin red ni GPU. Anota cada paso que vive, para probar el ORDEN. */
function motorSimulado(a: Ajuste = {}, registro: string[] = []): MotorSDTurbo {
  let enCache = a.yaEnCache ?? false;
  return {
    sondear: async () => {
      registro.push("sondear");
      return { ...BUENAS, ...a.sondas };
    },
    hayPesosEnCache: async () => {
      registro.push("mirar-cache");
      return enCache;
    },
    cuotaLibre: async () => {
      registro.push("medir-espacio");
      return a.cuotaLibre === undefined ? BYTES_PESOS_SD_TURBO * 4 : a.cuotaLibre;
    },
    descargarPesos: async () => {
      registro.push("descargar");
      if (a.fallaDescarga) throw new Error(a.fallaDescarga);
      enCache = true;
    },
    generar: async () => {
      registro.push("generar");
      if (a.fallaGeneracion) throw a.fallaGeneracion;
      if (!enCache) throw new Error("no hay pesos en la caché");
      return IMAGEN;
    },
  };
}

describe("detección de WebGPU (sin WebGPU se dice y se usan las demás capas)", () => {
  it("con WebGPU, adaptador y f16 puede: y avisa de que los pesos se piden antes de bajarlos", () => {
    const d = detectaSDTurbo(BUENAS);
    expect(d).toMatchObject({ puede: true });
    expect(d.motivo).toContain("pesos");
  });
  it("cada sonda fallida se explica y distinta: navegador sin WebGPU, sin GPU y sin f16", () => {
    const sinWebGPU = detectaSDTurbo({ ...BUENAS, hayWebGPU: false });
    const sinAdaptador = detectaSDTurbo({ ...BUENAS, hayAdaptador: false });
    const sinF16 = detectaSDTurbo({ ...BUENAS, f16: false });
    expect(sinWebGPU.puede).toBe(false);
    expect(sinAdaptador.puede).toBe(false);
    expect(sinF16.puede).toBe(false);
    expect(new Set([sinWebGPU.motivo, sinAdaptador.motivo, sinF16.motivo]).size).toBe(3);
    expect(sinWebGPU.motivo).toContain("las demás capas");
    expect(sinF16.motivo).toContain("no se baja nada");
  });
});

describe("plan de pesos: nada se baja solo", () => {
  it("ya en caché se usa sin pedir ni bajar nada", () => {
    const p = planPesos({ enCache: true, permiso: false, cuotaLibreBytes: null });
    expect(p).toMatchObject({ accion: "usar-cache", bytes: BYTES_PESOS_SD_TURBO });
  });
  it("sin permiso pide permiso y dice el tamaño en claro", () => {
    const p = planPesos({ enCache: false, permiso: false, cuotaLibreBytes: 500 * GB });
    expect(p.accion).toBe("pedir-permiso");
    expect(p.motivo).toContain(textoBytes(BYTES_PESOS_SD_TURBO));
  });
  it("sin poder medir el espacio libre no se baja nada; con menos del triple tampoco", () => {
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 - 1 }).accion).toBe(
      "sin-espacio",
    );
  });
  it("con el triple exacto de espacio libre sí se baja a la caché", () => {
    const p = planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 });
    expect(p).toMatchObject({ accion: "descargar", bytes: BYTES_PESOS_SD_TURBO });
    expect(p.motivo).toContain("caché");
  });
});

describe("flujo entero con el motor simulado (detectar → pedir → descargar → generar)", () => {
  it("camino feliz: descarga con permiso y genera, en ese orden", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({}, registro), PETICION);
    expect(r).toMatchObject({ ok: true, accion: "listo", imagen: IMAGEN });
    expect(registro).toEqual(["sondear", "mirar-cache", "medir-espacio", "descargar", "generar"]);
  });

  it("pesos ya en caché: genera sin descargar ni pedir permiso", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({ yaEnCache: true }, registro), { ...PETICION, permisoDescarga: false });
    expect(r).toMatchObject({ ok: true, accion: "listo" });
    expect(registro).toEqual(["sondear", "mirar-cache", "medir-espacio", "generar"]);
  });

  it("sin WebGPU se detiene tras sondear y no toca la red ni la GPU", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({ sondas: { hayWebGPU: false } }, registro), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-webgpu" });
    expect(r.motivo).toContain("las demás capas");
    expect(registro).toEqual(["sondear"]);
  });

  it("sin f16 tampoco: los pesos lo necesitan y no se baja nada", async () => {
    const r = await generaEnPestana(motorSimulado({ sondas: { f16: false } }), PETICION);
    expect(r.motivo).toContain("no se baja nada");
    expect(r.ok).toBe(false);
  });

  it("sin espacio comprobable se detiene: ninguna descarga sin medir el triple", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({ cuotaLibre: null }, registro), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-espacio" });
    expect(registro).toEqual(["sondear", "mirar-cache", "medir-espacio"]);
  });

  it("sin permiso se detiene antes de descargar: nada se baja solo", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({}, registro), { ...PETICION, permisoDescarga: false });
    expect(r).toMatchObject({ ok: false, accion: "pedir-permiso" });
    expect(registro).toEqual(["sondear", "mirar-cache", "medir-espacio"]);
  });

  it("fallo al descargar: se dice el porqué y no se genera", async () => {
    const registro: string[] = [];
    const r = await generaEnPestana(motorSimulado({ fallaDescarga: "se cortó la red" }, registro), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "error" });
    expect(r.motivo).toContain("se cortó la red");
    expect(registro).toEqual(["sondear", "mirar-cache", "medir-espacio", "descargar"]);
  });

  it("fallo al generar: se dice en claro también si el error no es un Error", async () => {
    const r = await generaEnPestana(motorSimulado({ yaEnCache: true, fallaGeneracion: "sin memoria" }), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "error" });
    expect(r.motivo).toContain("sin memoria");
    expect(r.motivo).toContain("Se usan las demás capas");
  });
});

describe("pesos y catálogo (licencia «sin comprobar del todo»)", () => {
  const sd = modeloPorId("sd-turbo")!;
  it("los pesos son los TRES archivos necesarios del repo ONNX, y nada más", () => {
    expect(new Set(PESOS_SD_TURBO.map((p) => p.ruta))).toEqual(
      new Set(["unet/model.onnx", "text_encoder/model.onnx", "vae_decoder/model.onnx"]),
    );
    expect(PESOS_SD_TURBO.every((p) => p.bytes > 0)).toBe(true);
    expect(BYTES_PESOS_SD_TURBO).toBe(PESOS_SD_TURBO.reduce((t, p) => t + p.bytes, 0));
    expect(BYTES_PESOS_SD_TURBO).toBeGreaterThan(2 * GB);
    expect(BYTES_PESOS_SD_TURBO).toBeLessThan(3 * GB);
  });
  it("SD-Turbo en el catálogo: condicionado, no gated, un paso, 512 y licencia sin comprobar del todo", () => {
    expect(sd).toMatchObject({ uso: "condicionado", gated: false, pasos: 1, resolucion: 512 });
    expect(sd.nota).toContain("sin comprobar");
    expect(sd.motores).toContain("onnx-web");
  });
  it("el motor onnx-web es el ejemplo de Microsoft y la versión de onnxruntime-web va clavada", () => {
    expect(MOTORES["onnx-web"].fuente).toContain("onnxruntime-inference-examples");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
