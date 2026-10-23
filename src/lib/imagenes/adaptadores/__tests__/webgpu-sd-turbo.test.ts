/**
 * Pruebas de la capa «navegador» para SD-Turbo (IMG1011H · parte 3 de 3): detección de WebGPU y
 * flujo completo con un motor simulado. Todo puro: sin red, GPU ni disco (contrato
 * architecture/astraura-imagenes.md §1 y §8: nada se descarga sin permiso y ninguna sonda inventa).
 */
import { describe, expect, it } from "vitest";
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, VERSION_ONNXRUNTIME_WEB,
  detectaSDTurbo, generaEnPestana, planPesos, textoBytes,
  type ImagenSDTurbo, type MotorSDTurbo, type SondasWebGPU,
} from "../webgpu-sd-turbo";
import { modeloPorId } from "../../modelos";

const BUENAS: SondasWebGPU = { hayWebGPU: true, hayAdaptador: true, f16: true };
const IMAGEN: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: "sd-turbo" };
const PETICION = { prompt: "un faro al amanecer", semilla: 42, permisoDescarga: true };

/** El motor simulado deja aquí lo que hizo, en orden: para exigir el flujo detectar → descargar → generar. */
type Pasos = string[];

function motorSimulado(pasos: Pasos, ajustes: Partial<MotorSDTurbo> = {}): MotorSDTurbo {
  return {
    sondear: async () => BUENAS,
    hayPesosEnCache: async () => false,
    cuotaLibre: async () => BYTES_PESOS_SD_TURBO * 4,
    descargarPesos: async () => { pasos.push("descarga"); },
    generar: async () => { pasos.push("generar"); return IMAGEN; },
    ...ajustes,
  };
}

describe("pesos y catálogo declarados", () => {
  it("declara exactamente los tres pesos necesarios y su total de 2,51 GB", () => {
    const rutas = PESOS_SD_TURBO.map((p) => p.ruta);
    expect(rutas).toEqual(["unet/model.onnx", "text_encoder/model.onnx", "vae_decoder/model.onnx"]);
    expect(PESOS_SD_TURBO.every((p) => p.bytes > 0)).toBe(true);
    expect(BYTES_PESOS_SD_TURBO).toBe(PESOS_SD_TURBO.reduce((t, p) => t + p.bytes, 0));
    expect(BYTES_PESOS_SD_TURBO).toBeGreaterThan(Math.round(2.5e9));
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).toBe("2,3 GB");
  });

  it("el catálogo mantiene la licencia «sin comprobar del todo» y las constantes fijadas", () => {
    expect(modeloPorId("sd-turbo")!.nota).toContain("sin comprobar del todo");
    expect(modeloPorId("sd-turbo")!.motores).toContain("onnx-web");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CACHE_PESOS_SD_TURBO).not.toContain("/");
  });
});

describe("detectaSDTurbo", () => {
  it("con las tres sondas buena, puede y explica el tamaño antes de pedir permiso", () => {
    const d = detectaSDTurbo(BUENAS);
    expect(d.puede).toBe(true);
    expect(d.motivo).toContain("2,3 GB");
    expect(d.motivo).toContain("se piden");
  });

  it("sin WebGPU, sin adaptador o sin f16 no puede, y cada razón es distinta", () => {
    const FALTAS = ["hayWebGPU", "hayAdaptador", "f16"] as const;
    for (const falta of FALTAS) expect(detectaSDTurbo({ ...BUENAS, [falta]: false } as SondasWebGPU).puede).toBe(false);
    const motivos = FALTAS.map((falta) => detectaSDTurbo({ ...BUENAS, [falta]: false } as SondasWebGPU).motivo);
    expect(new Set(motivos).size).toBe(3);
  });
});

describe("planPesos", () => {
  it("con la caché llena usa los pesos sin pedir ni descargar nada", () => {
    const p = planPesos({ enCache: true, permiso: false, cuotaLibreBytes: null });
    expect(p).toMatchObject({ accion: "usar-cache", bytes: BYTES_PESOS_SD_TURBO });
  });

  it("sin permiso pide permiso; sin cuota medible o con poco espacio, no descarga (regla ≥ 3× del §8)", () => {
    expect(planPesos({ enCache: false, permiso: false, cuotaLibreBytes: 1e12 }).accion).toBe("pedir-permiso");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 - 1 }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 }).accion).toBe("descargar");
  });
});

describe("generaEnPestana (flujo con motor simulado)", () => {
  it("sin WebGPU se corta antes: no mide caché ni cuota ni descarga ni genera", async () => {
    const pasos: Pasos = [];
    const r = await generaEnPestana(motorSimulado(pasos, { sondear: async () => ({ ...BUENAS, hayWebGPU: false }) }), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-webgpu" });
    expect(pasos).toEqual([]);
  });

  it("los cortes antes de descargar: sin permiso, cuota inmedible o sin espacio, y nunca genera", async () => {
    const pasos: Pasos = [];
    const sinPermiso = await generaEnPestana(motorSimulado(pasos), { ...PETICION, permisoDescarga: false });
    expect(sinPermiso).toMatchObject({ ok: false, accion: "pedir-permiso" });
    expect(sinPermiso.motivo).toContain("sin que lo permitas");
    const inmedible = await generaEnPestana(motorSimulado(pasos, { cuotaLibre: async () => null }), PETICION);
    const sinEspacio = await generaEnPestana(motorSimulado(pasos, { cuotaLibre: async () => BYTES_PESOS_SD_TURBO }), PETICION);
    for (const r of [inmedible, sinEspacio]) expect(r).toMatchObject({ ok: false, accion: "sin-espacio" });
    expect(pasos).toEqual([]);
  });

  it("el orden es descarga y luego generar; y con caché llena genera sin descargar", async () => {
    const pasos: Pasos = [];
    const r = await generaEnPestana(motorSimulado(pasos), PETICION);
    expect(r).toEqual({ ok: true, accion: "listo", motivo: expect.any(String), imagen: IMAGEN, ms: expect.any(Number) });
    expect(pasos).toEqual(["descarga", "generar"]);
    const yaCache = await generaEnPestana(motorSimulado(pasos, { hayPesosEnCache: async () => true }), PETICION);
    expect(yaCache).toMatchObject({ ok: true, accion: "listo", imagen: IMAGEN });
    expect(pasos).toEqual(["descarga", "generar", "generar"]);
  });

  it("los fallos se cuentan en claro y no se generan imágenes: al descargar y al generar", async () => {
    const pasos: Pasos = [];
    const caidaRed = await generaEnPestana(motorSimulado(pasos, { descargarPesos: async () => { throw new Error("caché rechazó la reserva"); } }), PETICION);
    expect(caidaRed).toMatchObject({ ok: false, accion: "error" });
    expect(caidaRed.motivo).toContain("caché rechazó la reserva");
    expect(pasos).toEqual([]);
    const falloGenerar = await generaEnPestana(motorSimulado([], { generar: async () => { throw "la GPU se quedó sin memoria"; } }), PETICION);
    expect(falloGenerar).toMatchObject({ ok: false, accion: "error" });
    expect(falloGenerar.motivo).toContain("la GPU se quedó sin memoria");
  });
});
