/**
 * RTCOL1012Md-d3 · rescatadas de la rama nube/39717140328 («Genesis en el A1», parte 3 de 3)
 * y adaptadas a la API de hoy. Todo puro: motor simulado en memoria, sin red ni GPU.
 */
import { describe, expect, it } from "vitest";
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, MODELO_SD_TURBO, PESOS_SD_TURBO,
  REPO_ONNX_SD_TURBO, VERSION_ONNXRUNTIME_WEB, detectaSDTurbo, generaEnPestana,
  textoBytes, type ImagenSDTurbo, type MotorSDTurbo, type SondasWebGPU,
} from "../webgpu-sd-turbo";
import { modeloPorId } from "../../../imagenes/modelos";

const GB = 1024 ** 3;
const sondaOk: SondasWebGPU = { hayWebGPU: true, hayAdaptador: true, f16: true };

interface MotorSim { motor: MotorSDTurbo; llamadas: string[] }

function motorSimulado(opciones: { sonda?: SondasWebGPU; cuota?: number | null; fallo?: Error } = {}): MotorSim {
  const llamadas: string[] = [];
  const imagen: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: "simulado" };
  const motor: MotorSDTurbo = {
    sondear: async () => {
      llamadas.push("sondear");
      return opciones.sonda ?? sondaOk;
    },
    hayPesosEnCache: async () => {
      llamadas.push("hayPesosEnCache");
      return false;
    },
    cuotaLibre: async () => {
      llamadas.push("cuotaLibre");
      return opciones.cuota === undefined ? 24 * GB : opciones.cuota;
    },
    descargarPesos: async () => {
      llamadas.push("descargarPesos");
    },
    generar: async (p) => {
      llamadas.push(`generar:${p.prompt}:${p.semilla}`);
      if (opciones.fallo) throw opciones.fallo;
      return imagen;
    },
  };
  return { motor, llamadas };
}

describe("los pesos de SD-Turbo (datos del ejemplo oficial de Microsoft)", () => {
  it("son los tres ONNX de texto a imagen, con el tamaño medido", () => {
    expect(PESOS_SD_TURBO.map((a) => a.ruta)).toEqual([
      "unet/model.onnx", "text_encoder/model.onnx", "vae_decoder/model.onnx",
    ]);
    expect(BYTES_PESOS_SD_TURBO).toBe(1733430199 + 681393168 + 99094314);
  });
  it("el total ronda los 2,5 GB y las URLs son las de Hugging Face del ejemplo oficial", () => {
    expect(BYTES_PESOS_SD_TURBO).toBeGreaterThan(2.4 * 10 ** 9);
    expect(REPO_ONNX_SD_TURBO).toContain("schmuell/sd-turbo-ort-web");
    expect(`${REPO_ONNX_SD_TURBO}/${PESOS_SD_TURBO[0].ruta}`).toBe(
      "https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/unet/model.onnx",
    );
    expect(typeof CACHE_PESOS_SD_TURBO).toBe("string");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("textoBytes lo dice en claro, en español", () => {
    expect(textoBytes(BYTES_PESOS_SD_TURBO)).toBe("2,3 GB");
    expect(textoBytes(681393168)).toBe("650 MB");
    expect(textoBytes(0)).toBe("0 MB");
  });
});

describe("detectaSDTurbo: se dice por qué y no se promete nada", () => {
  it("sin WebGPU, sin adaptador o sin f16 se explica; con las tres sondas se puede", () => {
    const nada = { hayWebGPU: false, hayAdaptador: false, f16: false };
    expect(detectaSDTurbo(nada).puede).toBe(false);
    expect(detectaSDTurbo(nada).motivo).toContain("no tiene WebGPU");
    expect(detectaSDTurbo({ hayWebGPU: true, hayAdaptador: false, f16: false }).motivo).toContain("no hay GPU");
    expect(detectaSDTurbo({ hayWebGPU: true, hayAdaptador: true, f16: false }).motivo).toContain("f16");
    expect(detectaSDTurbo(sondaOk).puede).toBe(true);
  });
});

describe("generaEnPestana: detectar → pedir permiso → descargar a la caché → generar", () => {
  it("sin WebGPU no se toca el motor y se sigue con las demás capas", async () => {
    const s = motorSimulado({ sonda: { hayWebGPU: false, hayAdaptador: false, f16: false } });
    const r = await generaEnPestana(s.motor, { prompt: "un faro", semilla: 7, permisoDescarga: true });
    expect(r.ok).toBe(false);
    expect(r.accion).toBe("sin-webgpu");
    expect(s.llamadas).toEqual(["sondear"]);
  });
  it("sin permiso se pide antes de descargar nada, diciendo el tamaño", async () => {
    const s = motorSimulado();
    const r = await generaEnPestana(s.motor, { prompt: "un faro", semilla: 7, permisoDescarga: false });
    expect(r.ok).toBe(false);
    expect(r.accion).toBe("pedir-permiso");
    expect(r.motivo).toContain("2,3 GB");
    expect(s.llamadas).toEqual(["sondear", "hayPesosEnCache", "cuotaLibre"]);
  });
  it("sin espacio comprobable no se descarga, y con poco tampoco (regla del triple)", async () => {
    const s1 = motorSimulado({ cuota: null });
    const r1 = await generaEnPestana(s1.motor, { prompt: "x", semilla: 1, permisoDescarga: true });
    expect(r1.ok).toBe(false);
    expect(r1.accion).toBe("sin-espacio");
    expect(s1.llamadas).toEqual(["sondear", "hayPesosEnCache", "cuotaLibre"]);
    const s2 = motorSimulado({ cuota: 3 * GB });
    const r2 = await generaEnPestana(s2.motor, { prompt: "x", semilla: 1, permisoDescarga: true });
    expect(r2.accion).toBe("sin-espacio");
    expect(s2.llamadas).toEqual(["sondear", "hayPesosEnCache", "cuotaLibre"]);
  });
  it("con permiso y espacio: descarga a la caché y genera la imagen", async () => {
    const s = motorSimulado();
    const r = await generaEnPestana(s.motor, { prompt: "un faro en la niebla", semilla: 7, permisoDescarga: true });
    expect(r.ok).toBe(true);
    expect(r.accion).toBe("listo");
    expect(r.imagen).toBeDefined();
    expect(s.llamadas).toEqual([
      "sondear", "hayPesosEnCache", "cuotaLibre", "descargarPesos", "generar:un faro en la niebla:7",
    ]);
  });
  it("si el motor falla, se dice y se vuelve a las demás capas", async () => {
    const s = motorSimulado({ fallo: new Error("se ha quedado sin memoria") });
    const r = await generaEnPestana(s.motor, { prompt: "x", semilla: 1, permisoDescarga: true });
    expect(r.ok).toBe(false);
    expect(r.accion).toBe("error");
    expect(r.motivo).toContain("se ha quedado sin memoria");
  });
});

describe("la ficha del catálogo y la licencia dicen lo mismo", () => {
  it("Stability, uso condicionado y «sin comprobar del todo» a la vista", () => {
    const ficha = modeloPorId(MODELO_SD_TURBO);
    expect(ficha).toBeDefined();
    expect(ficha!.id).toBe(MODELO_SD_TURBO);
    expect(ficha!.licencia).toContain("Stability");
    expect(ficha!.uso).toBe("condicionado");
    expect(ficha!.nota).toContain("sin comprobar del todo");
  });
});
