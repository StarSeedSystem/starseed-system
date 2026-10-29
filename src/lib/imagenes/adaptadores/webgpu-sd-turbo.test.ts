import { describe, expect, it } from "vitest";
import { modeloPorId } from "@/lib/imagenes/modelos";
import {
  BYTES_PESOS_SD_TURBO,
  CACHE_PESOS_SD_TURBO,
  MODELO_SD_TURBO,
  PESOS_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB,
  detectaSDTurbo,
  generaEnPestana,
  planPesos,
  textoBytes,
  type ImagenSDTurbo,
  type MotorSDTurbo,
  type SondasWebGPU,
} from "./webgpu-sd-turbo";

const BUENAS: SondasWebGPU = { hayWebGPU: true, hayAdaptador: true, f16: true };
const IMAGEN: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: "sd-turbo" };
const PETICION = { prompt: "un faro", semilla: 1, permisoDescarga: true };

function motor(over: Partial<MotorSDTurbo> = {}, llamadas: string[] = []): MotorSDTurbo {
  return {
    sondear: async () => BUENAS,
    hayPesosEnCache: async () => false,
    cuotaLibre: async () => BYTES_PESOS_SD_TURBO * 4,
    descargarPesos: async () => { llamadas.push("descargar"); },
    generar: async () => { llamadas.push("generar"); return IMAGEN; },
    ...over,
  };
}

describe("webgpu-sd-turbo · contrato público", () => {
  it("exporta funciones y los tres pesos necesarios", () => {
    expect(typeof detectaSDTurbo).toBe("function");
    expect(typeof planPesos).toBe("function");
    expect(typeof generaEnPestana).toBe("function");
    expect(PESOS_SD_TURBO).toHaveLength(3);
    expect(BYTES_PESOS_SD_TURBO).toBe(PESOS_SD_TURBO.reduce((t, p) => t + p.bytes, 0));
  });

  it("generaEnPestana devuelve una promesa", () => {
    expect(generaEnPestana(motor(), PETICION)).toBeInstanceOf(Promise);
  });

  it("el catálogo mantiene la licencia «sin comprobar del todo» y las constantes fijadas", () => {
    const ficha = modeloPorId(MODELO_SD_TURBO);
    expect(ficha).toBeDefined();
    expect(ficha!.nota).toContain("sin comprobar del todo");
    expect(ficha!.motores).toContain("onnx-web");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CACHE_PESOS_SD_TURBO).not.toContain("/");
  });

  it("declara exactamente las tres rutas y un total que pasa de 2,5 GB", () => {
    expect(PESOS_SD_TURBO.map((p) => p.ruta)).toEqual([
      "unet/model.onnx",
      "text_encoder/model.onnx",
      "vae_decoder/model.onnx",
    ]);
    expect(PESOS_SD_TURBO.every((p) => p.bytes > 0)).toBe(true);
    expect(BYTES_PESOS_SD_TURBO).toBeGreaterThan(Math.round(2.5e9));
  });
});

describe("textoBytes", () => {
  it("usa GB con coma y MB redondeados", () => {
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).toMatch(/^\d+,\d GB$/);
    expect(textoBytes(640 * 1024 ** 2)).toBe("640 MB");
  });
  it("no inventa tamaños inválidos", () => {
    expect(textoBytes(NaN)).toBe("tamaño desconocido");
    expect(textoBytes(-1)).toBe("tamaño desconocido");
  });
});

describe("detectaSDTurbo", () => {
  it("solo puede con WebGPU, adaptador y f16", () => {
    expect(detectaSDTurbo(BUENAS).puede).toBe(true);
    expect(detectaSDTurbo({ ...BUENAS, hayWebGPU: false }).puede).toBe(false);
    expect(detectaSDTurbo({ ...BUENAS, hayAdaptador: false }).puede).toBe(false);
    expect(detectaSDTurbo({ ...BUENAS, f16: false }).puede).toBe(false);
  });
  it("explica cada motivo distinto", () => {
    const motivos = [
      detectaSDTurbo({ hayWebGPU: false, hayAdaptador: false, f16: false }).motivo,
      detectaSDTurbo({ hayWebGPU: true, hayAdaptador: false, f16: false }).motivo,
      detectaSDTurbo({ hayWebGPU: true, hayAdaptador: true, f16: false }).motivo,
    ];
    expect(new Set(motivos).size).toBe(3);
  });
});

describe("planPesos", () => {
  it("usa la caché sin pedir nada", () => {
    expect(planPesos({ enCache: true, permiso: false, cuotaLibreBytes: null }).accion).toBe("usar-cache");
  });
  it("sin permiso pide permiso y no descarga", () => {
    expect(planPesos({ enCache: false, permiso: false, cuotaLibreBytes: 1e12 }).accion).toBe("pedir-permiso");
  });
  it("sin poder medir el espacio no descarga", () => {
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null }).accion).toBe("sin-espacio");
  });
  it("exige el triple de los pesos libres", () => {
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 - 1 }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 }).accion).toBe("descargar");
  });
});

describe("generaEnPestana", () => {
  it("sin WebGPU no toca la red ni genera", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({ sondear: async () => ({ ...BUENAS, f16: false }) }, llamadas), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-webgpu" });
    expect(llamadas).toEqual([]);
  });

  it("sin permiso no descarga", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({}, llamadas), { ...PETICION, permisoDescarga: false });
    expect(r).toMatchObject({ ok: false, accion: "pedir-permiso" });
    expect(llamadas).toEqual([]);
  });

  it("con permiso y espacio descarga y luego genera", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({}, llamadas), PETICION);
    expect(r).toMatchObject({ ok: true, accion: "listo", imagen: IMAGEN });
    expect(llamadas).toEqual(["descargar", "generar"]);
  });

  it("con los pesos en caché genera sin descargar", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({ hayPesosEnCache: async () => true }, llamadas), { ...PETICION, permisoDescarga: false });
    expect(r.ok).toBe(true);
    expect(llamadas).toEqual(["generar"]);
  });

  it("un fallo al descargar se dice y no genera", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({ descargarPesos: async () => { throw new Error("red caída"); } }, llamadas), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "error" });
    expect(r.motivo).toContain("red caída");
    expect(llamadas).toEqual([]);
  });

  it("un fallo al generar se dice, incluso si no es un Error", async () => {
    const r = await generaEnPestana(motor({ generar: async () => { throw "sin memoria"; } }), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "error" });
    expect(r.motivo).toContain("sin memoria");
  });
});
