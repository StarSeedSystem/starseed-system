/**
 * Pruebas de la detección de WebGPU y del flujo de SD-Turbo en la pestaña (IMG1011H · parte 1).
 * Todo puro: motor SIMULADO, sin red, sin GPU, sin caché del navegador y sin descargar nada.
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIVOS_SD_TURBO,
  BASE_MODELOS_SD_TURBO,
  CACHE_MODELOS_SD_TURBO,
  LICENCIA_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB,
  evaluaWebGPU,
  espacioLibreBytes,
  fichaSdTurbo,
  formateaBytes,
  flujoSdTurbo,
  sondeaWebGPU,
  totalBytesSDTurbo,
  urlDeArchivo,
  type ArchivoSdTurbo,
  type EventoSdTurbo,
  type MotorSdTurbo,
  type SondaWebGPU,
} from "../webgpu-sd-turbo";

const GB = 1024 ** 3;
/** Motor simulado: no toca la red ni la GPU, solo deja constancia de lo que se le pidió. */
function motorSimulado(fallo?: Error) {
  const llamadas: string[] = [];
  const motor: MotorSdTurbo = {
    async preparar() {
      llamadas.push("preparar");
    },
    async cargar(archivos: readonly ArchivoSdTurbo[], alCambiar) {
      llamadas.push(`cargar:${archivos.length}`);
      alCambiar?.({ hechos: 1, total: archivos.length, bytesHechos: 1024, bytesTotal: 2048 });
      return { deCache: false };
    },
    async generar(prompt: string, semilla: number) {
      llamadas.push(`generar:${prompt}:${semilla}`);
      if (fallo) throw fallo;
      return "data:image/png;base64,SIMULADA";
    },
  };
  return { motor, llamadas };
}

describe("manifiesto de los pesos de SD-Turbo (tamaños reales, no estimaciones)", () => {
  it("trae los tres pesos en ONNX del ejemplo oficial con su tamaño medido", () => {
    const onnx = ARCHIVOS_SD_TURBO.filter((a) => a.ruta.endsWith(".onnx"));
    expect(onnx.map((a) => a.ruta)).toEqual(["unet/model.onnx", "text_encoder/model.onnx", "vae_decoder/model.onnx"]);
    expect(onnx.every((a) => a.pesado)).toBe(true);
    expect(totalBytesSDTurbo(onnx)).toBe(1733430199 + 681393168 + 99094314);
  });
  it("el total son unos 2,3 GB y las URLs son las de Hugging Face del ejemplo oficial", () => {
    expect(totalBytesSDTurbo()).toBeGreaterThan(2.4 * 10 ** 9);
    expect(BASE_MODELOS_SD_TURBO).toContain("schmuell/sd-turbo-ort-web");
    expect(urlDeArchivo(ARCHIVOS_SD_TURBO[0])).toBe(`${BASE_MODELOS_SD_TURBO}/unet/model.onnx`);
    expect(CACHE_MODELOS_SD_TURBO).toBe("onnx");
    expect(VERSION_ONNXRUNTIME_WEB).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("formateaBytes en español", () => {
    expect(formateaBytes(2.34 * GB)).toBe("2,3 GB");
    expect(formateaBytes(681393168)).toBe("649,8 MB");
    expect(formateaBytes(0)).toBe("0 B");
  });
});

describe("detección de WebGPU (lo primero: saber si aquí se puede)", () => {
  const gpuPerfecto = { gpu: true, adaptador: true, fp16: true };
  it("sin WebGPU se dice por qué y no se promete nada", () => {
    const e = evaluaWebGPU({ gpu: false, adaptador: false, fp16: false });
    expect(e.disponible).toBe(false);
    expect(e.motivo).toContain("no tiene WebGPU");
  });
  it("con WebGPU pero sin adaptador, o sin fp16, también se explica", () => {
    expect(evaluaWebGPU({ gpu: true, adaptador: false, fp16: false }).motivo).toContain("adaptador");
    expect(evaluaWebGPU({ gpu: true, adaptador: true, fp16: false }).motivo).toContain("fp16");
    expect(evaluaWebGPU(gpuPerfecto).disponible).toBe(true);
  });
  it("sondeaWebGPU lee el navegador: sin gpu, sin adaptador, con fp16 y con errores", async () => {
    expect(await sondeaWebGPU({})).toEqual({ gpu: false, adaptador: false, fp16: false });
    expect(await sondeaWebGPU({ gpu: { requestAdapter: async () => null } })).toEqual({ gpu: true, adaptador: false, fp16: false });
    expect(await sondeaWebGPU({ gpu: { requestAdapter: async () => ({ features: { has: () => true } }) } }))
      .toEqual({ gpu: true, adaptador: true, fp16: true });
    expect(await sondeaWebGPU({ gpu: { requestAdapter: async () => ({ features: { has: () => false } }) } }))
      .toEqual({ gpu: true, adaptador: true, fp16: false });
    expect(await sondeaWebGPU({ gpu: { requestAdapter: async () => { throw new Error("boom"); } } }))
      .toEqual({ gpu: true, adaptador: false, fp16: false });
  });
});

describe("flujo de SD-Turbo en la pestaña (motor simulado)", () => {
  const sonda: SondaWebGPU = { gpu: true, adaptador: true, fp16: true };
  const espacioHolgado = { cuotaBytes: 20 * GB, usadoBytes: 1 * GB };

  it("sin WebGPU no se toca el motor y se sigue con las demás capas", async () => {
    const { motor, llamadas } = motorSimulado();
    const r = await flujoSdTurbo({
      motor, sonda: { gpu: false, adaptador: false, fp16: false },
      espacio: espacioHolgado, permiso: true, prompt: "un faro",
    });
    expect(r.ok).toBe(false);
    expect(r.estado).toBe("sin-webgpu");
    expect(r.usarOtrasCapas).toBe(true);
    expect(llamadas).toEqual([]);
  });

  it("sin permiso se pide antes de descargar nada, diciendo el tamaño", async () => {
    const { motor, llamadas } = motorSimulado();
    const r = await flujoSdTurbo({ motor, sonda, espacio: espacioHolgado, permiso: false, prompt: "un faro" });
    expect(r.estado).toBe("sin-permiso");
    expect(r.mensaje).toContain("2,3 GB");
    expect(r.mensaje).toContain("¿Los descargas?");
    expect(llamadas).toEqual([]);
  });

  it("sin espacio comprobable no se descarga; y con poco espacio tampoco (regla del triple)", async () => {
    const s1 = motorSimulado();
    const r1 = await flujoSdTurbo({ motor: s1.motor, sonda, espacio: null, permiso: true, prompt: "x" });
    expect(r1.estado).toBe("sin-espacio");
    expect(s1.llamadas).toEqual([]);
    const s2 = motorSimulado();
    const r2 = await flujoSdTurbo({ motor: s2.motor, sonda, espacio: { cuotaBytes: 3 * GB, usadoBytes: 0 }, permiso: true, prompt: "x" });
    expect(r2.estado).toBe("sin-espacio");
    expect(s2.llamadas).toEqual([]);
  });

  it("con permiso y espacio: descarga, genera y devuelve la imagen", async () => {
    const { motor, llamadas } = motorSimulado();
    const eventos: EventoSdTurbo[] = [];
    const r = await flujoSdTurbo({
      motor, sonda, espacio: espacioHolgado, permiso: true, prompt: "un faro en la niebla", semilla: 7,
      alCambiar: (e) => eventos.push(e),
    });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("hecho");
    expect(r.imagen).toBe("data:image/png;base64,SIMULADA");
    expect(llamadas).toEqual(["preparar", `cargar:${ARCHIVOS_SD_TURBO.length}`, "generar:un faro en la niebla:7"]);
    expect(eventos.map((e) => e.estado)).toEqual(["descargando", "descargando", "listo", "generando", "hecho"]);
    expect(eventos.some((e) => e.progreso?.hechos === 1)).toBe(true);
  });

  it("si el motor falla, se dice y se vuelve a las demás capas", async () => {
    const { motor } = motorSimulado(new Error("se ha quedado sin memoria"));
    const r = await flujoSdTurbo({ motor, sonda, espacio: espacioHolgado, permiso: true, prompt: "x" });
    expect(r.ok).toBe(false);
    expect(r.estado).toBe("error");
    expect(r.mensaje).toContain("se ha quedado sin memoria");
    expect(r.usarOtrasCapas).toBe(true);
  });

  it("el espacio libre nunca sale negativo", () => {
    expect(espacioLibreBytes({ cuotaBytes: 10, usadoBytes: 20 })).toBe(0);
    expect(espacioLibreBytes({ cuotaBytes: 10, usadoBytes: 4 })).toBe(6);
  });
});

describe("licencia de SD-Turbo (catálogo: condicionada, sin comprobar del todo)", () => {
  it("la ficha del catálogo y la licencia del adaptador dicen lo mismo", () => {
    const ficha = fichaSdTurbo();
    expect(ficha).toBeDefined();
    expect(ficha!.licencia).toContain("Stability");
    expect(ficha!.uso).toBe("condicionado");
    expect(ficha!.nota).toContain("sin comprobar del todo");
    expect(LICENCIA_SD_TURBO.estado).toBe("sin-comprobar-del-todo");
    expect(LICENCIA_SD_TURBO.uso).toBe("condicionado");
  });
});
