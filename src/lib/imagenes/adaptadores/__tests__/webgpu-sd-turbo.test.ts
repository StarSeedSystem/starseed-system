/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA (IMG1011H · parte 3 de 3).
 * Pruebas PURAS de src/lib/imagenes/adaptadores/webgpu-sd-turbo.ts: catálogo, detección WebGPU,
 * plan de pesos (regla del triple) y flujo completo con un motor SIMULADO (sin red ni GPU).
 */
import { describe, expect, it } from "vitest";
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, MODELO_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO,
  TOKENIZER_CLIP_SD_TURBO, VERSION_ONNXRUNTIME_WEB, detectaSDTurbo, generaEnPestana, planPesos, textoBytes,
  type ImagenSDTurbo, type MotorSDTurbo, type SondasWebGPU,
} from "../webgpu-sd-turbo";
import { modeloPorId } from "../../modelos";


const BUENAS: SondasWebGPU = { hayWebGPU: true, hayAdaptador: true, f16: true };
const IMAGEN: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: "sd-turbo" };
const PETICION = { prompt: "un faro en la niebla", semilla: 1, permisoDescarga: true };

/** Motor simulado: cumple el contrato de la parte del worker sin red, sin GPU y sin navegador. */
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

describe("webgpu-sd-turbo · catálogo del módulo", () => {
  it("exporta las funciones puras y el id del modelo", () => {
    expect(typeof detectaSDTurbo).toBe("function");
    expect(typeof planPesos).toBe("function");
    expect(typeof generaEnPestana).toBe("function");
    expect(typeof textoBytes).toBe("function");
    expect(MODELO_SD_TURBO).toBe("sd-turbo");
    expect(BYTES_PESOS_SD_TURBO).toBe(PESOS_SD_TURBO.reduce((t, p) => t + p.bytes, 0));
  });

  it("fija el repo, la caché y la versión EXACTA que debe instalar la parte del worker", () => {
    expect(REPO_ONNX_SD_TURBO).toBe("https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main");
    expect(CACHE_PESOS_SD_TURBO).toBe("starseed-sd-turbo");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
    expect(TOKENIZER_CLIP_SD_TURBO).toBe("Xenova/clip-vit-base-patch16");
  });

  it("el catálogo lo describe con su licencia «sin comprobar del todo» y el motor onnx-web entre los suyos", () => {
    const ficha = modeloPorId(MODELO_SD_TURBO);
    expect(ficha).toBeDefined();
    expect(ficha!.nota).toContain("sin comprobar del todo");
    expect(ficha!.motores).toContain("onnx-web");
    expect(ficha!.uso).toBe("condicionado");
  });

  it("solo los TRES archivos necesarios: ni encoder del VAE ni scheduler", () => {
    expect(PESOS_SD_TURBO.map((p) => p.ruta)).toEqual(["unet/model.onnx", "text_encoder/model.onnx", "vae_decoder/model.onnx"]);
    for (const p of PESOS_SD_TURBO) expect(p.bytes).toBeGreaterThan(0);
  });

  it("el total de pesos cuadra con los 2,51 GB documentados: solo algo por debajo de 2,5·10⁹ y en claro «2,3 GB»", () => {
    expect(BYTES_PESOS_SD_TURBO).toBeGreaterThan(Math.round(2.5e9));
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).toBe("2,3 GB");
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).not.toBe("3,0 GB");
  });

  it("textoBytes: GB con coma y MB redondeados; no inventa tamaños inválidos", () => {
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).toMatch(/^\d+,\d GB$/);
    expect(textoBytes(640 * 1024 ** 2)).toBe("640 MB");
    expect(textoBytes(0)).toBe("0 MB");
    expect(textoBytes(NaN)).toBe("tamaño desconocido");
    expect(textoBytes(-1)).toBe("tamaño desconocido");
  });
});

describe("detectaSDTurbo · las tres sondas de WebGPU", () => {
  it("solo puede con WebGPU, adaptador y f16 a la vez", () => {
    expect(detectaSDTurbo(BUENAS).puede).toBe(true);
    for (const malas of [{ ...BUENAS, hayWebGPU: false }, { ...BUENAS, hayAdaptador: false }, { ...BUENAS, f16: false }])
      expect(detectaSDTurbo(malas).puede).toBe(false);
  });

  it("cada falta tiene su motivo distinto y en claro, sin promesas falsas", () => {
    const motivos = [
      detectaSDTurbo({ hayWebGPU: false, hayAdaptador: false, f16: false }).motivo,
      detectaSDTurbo({ ...BUENAS, hayAdaptador: false }).motivo,
      detectaSDTurbo({ ...BUENAS, f16: false }).motivo,
    ];
    expect(new Set(motivos).size).toBe(3);
    for (const m of motivos) expect(m).toContain("Se usan las demás capas");
    expect(motivos[2]).toContain("no se baja nada");
    const puede = detectaSDTurbo(BUENAS);
    expect(puede.motivo).toContain(textoBytes(BYTES_PESOS_SD_TURBO));
    expect(puede.motivo).toContain("se piden antes de descargarlos");
  });
});

describe("planPesos · reglas de la descarga (contrato §8)", () => {
  it("con cache listos no se baja nada; sin permiso se PIDE; sin espacio medible se detiene", () => {
    expect(planPesos({ enCache: true, permiso: false, cuotaLibreBytes: null })).toMatchObject({ accion: "usar-cache", bytes: BYTES_PESOS_SD_TURBO });
    expect(planPesos({ enCache: false, permiso: false, cuotaLibreBytes: 1e12 })).toMatchObject({ accion: "pedir-permiso", bytes: BYTES_PESOS_SD_TURBO });
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null })).toMatchObject({ accion: "sin-espacio", bytes: BYTES_PESOS_SD_TURBO });
    expect(planPesos({ enCache: true, permiso: false, cuotaLibreBytes: null }).motivo).toContain("no se descarga nada");
    expect(planPesos({ enCache: false, permiso: false, cuotaLibreBytes: 1e12 }).motivo).toContain("sin que lo permitas");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null }).motivo).toContain("No se puede comprobar el espacio libre");
  });

  it("exige el TRIPLE del peso de los pesos, ni un byte menos", () => {
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 - 1 }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 }).accion).toBe("descargar");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 - 1 }).motivo).toContain(textoBytes(BYTES_PESOS_SD_TURBO * 3));
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 4 }).motivo).toContain("caché del navegador");
  });
});

describe("generaEnPestana · flujo completo con el motor simulado", () => {
  it("sin WebGPU/f16 se dice y no se baja ni se genera nada", async () => {
    const llamadas: string[] = [];
    for (const malas of [{ ...BUENAS, hayWebGPU: false }, { ...BUENAS, hayAdaptador: false }, { ...BUENAS, f16: false }]) {
      const r = await generaEnPestana(motor({ sondear: async () => malas }, llamadas), PETICION);
      expect(r).toMatchObject({ ok: false, accion: "sin-webgpu" });
      expect(r.motivo).toContain("Se usan las demás capas");
      expect(r.imagen).toBeUndefined();
    }
    expect(llamadas).toEqual([]);
  });

  it("sin permiso o sin espacio para el triple: para en el plan y no toca el motor", async () => {
    const llamadas: string[] = [];
    expect(await generaEnPestana(motor({}, llamadas), { ...PETICION, permisoDescarga: false })).toMatchObject({ ok: false, accion: "pedir-permiso" });
    expect(await generaEnPestana(motor({ cuotaLibre: async () => BYTES_PESOS_SD_TURBO }, llamadas), PETICION)).toMatchObject({ ok: false, accion: "sin-espacio" });
    expect(llamadas).toEqual([]);
  });

  it("cuota INMEDIBLE (null) también corta el flujo entero antes de descargar, y lo dice con el motivo del plan", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({ cuotaLibre: async () => null }, llamadas), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-espacio" });
    expect(r.imagen).toBeUndefined();
    expect(r.motivo).toContain("No se puede comprobar el espacio libre");
    expect(llamadas).toEqual([]);
  });

  it("con permiso y espacio descarga los pesos y LUEGO genera", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({}, llamadas), PETICION);
    expect(r).toMatchObject({ ok: true, accion: "listo", imagen: IMAGEN });
    expect(r.motivo).toContain("SD-Turbo");
    expect(llamadas).toEqual(["descargar", "generar"]);
  });

  it("con los pesos ya en la caché genera sin descargar, aunque no haya permiso", async () => {
    const llamadas: string[] = [];
    const r = await generaEnPestana(motor({ hayPesosEnCache: async () => true }, llamadas), { ...PETICION, permisoDescarga: false });
    expect(r).toMatchObject({ ok: true, accion: "listo" });
    expect(llamadas).toEqual(["generar"]);
  });

  it("un fallo al descargar o al generar se dice en claro y no sale imagen", async () => {
    const llamadas: string[] = [];
    const falloDescarga = await generaEnPestana(motor({ descargarPesos: async () => { throw new Error("red caída"); } }, llamadas), PETICION);
    expect(falloDescarga).toMatchObject({ ok: false, accion: "error" });
    expect(falloDescarga.motivo).toContain("No se pudieron descargar los pesos");
    expect(falloDescarga.motivo).toContain("red caída");
    const falloGenera = await generaEnPestana(motor({ generar: async () => { throw "sin memoria en la GPU"; } }), PETICION);
    expect(falloGenera).toMatchObject({ ok: false, accion: "error" });
    expect(falloGenera.motivo).toContain("SD-Turbo no pudo generar");
    expect(falloGenera.motivo).toContain("sin memoria en la GPU");
    expect(falloGenera.imagen).toBeUndefined();
    expect(llamadas).toEqual([]);
  });
});


