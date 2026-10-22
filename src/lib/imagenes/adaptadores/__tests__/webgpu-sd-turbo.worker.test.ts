/**
 * Pruebas de SD-Turbo en la pestaña (IMG1011H): detección, plan de pesos y flujo completo con un motor
 * simulado. Todo puro: sin red, sin GPU y sin tocar el DOM. Se prueban también las cuentas del worker.
 */
import { describe, expect, it } from "vitest";
import {
  aPixelesRGB, escalaEntrada, pasoEuler, ruidoConSemilla, urlPeso,
} from "../webgpu-sd-turbo.worker";
import {
  BYTES_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO,
  detectaSDTurbo, generaEnPestana, planPesos,
  type ImagenSDTurbo, type MotorSDTurbo, type PeticionSDTurbo, type SondasWebGPU,
} from "../webgpu-sd-turbo";

const IMAGEN: ImagenSDTurbo = { ancho: 2, alto: 1, pixeles: new Uint8Array([1, 2, 3, 4, 5, 6]), motor: "onnx-web" };
const PETICION: PeticionSDTurbo = { prompt: "una pradera al amanecer", semilla: 7, permisoDescarga: false };

type Simulado = {
  sondas?: SondasWebGPU;
  enCache?: boolean;
  cuota?: number | null;
  fallaDescarga?: boolean;
  fallaGeneracion?: boolean;
  llamadas: string[];
};

function motorSimulado(o: Simulado): MotorSDTurbo {
  return {
    sondear: async () => {
      o.llamadas.push("sondear");
      return o.sondas ?? { hayWebGPU: true, hayAdaptador: true, f16: true };
    },
    hayPesosEnCache: async () => {
      o.llamadas.push("cache");
      return o.enCache ?? false;
    },
    cuotaLibre: async () => {
      o.llamadas.push("cuota");
      return o.cuota ?? BYTES_PESOS_SD_TURBO * 3;
    },
    descargarPesos: async () => {
      o.llamadas.push("descargar");
      if (o.fallaDescarga) throw new Error("la red se cayó");
    },
    generar: async () => {
      o.llamadas.push("generar");
      if (o.fallaGeneracion) throw new Error("la GPU se quedó sin memoria");
      return IMAGEN;
    },
  };
}

describe("detección de WebGPU", () => {
  it("sin WebGPU o sin adaptador se dice y no se baja nada", () => {
    expect(detectaSDTurbo({ hayWebGPU: false, hayAdaptador: false, f16: false })).toMatchObject({ puede: false });
    expect(detectaSDTurbo({ hayWebGPU: true, hayAdaptador: false, f16: false }).motivo).toMatch(/no hay GPU/);
  });
  it("con WebGPU pero sin f16 tampoco: los pesos no servirían", () => {
    const d = detectaSDTurbo({ hayWebGPU: true, hayAdaptador: true, f16: false });
    expect(d.puede).toBe(false);
    expect(d.motivo).toMatch(/shader-f16/);
  });
  it("con WebGPU y f16 sí, y avisa del tamaño de la descarga", () => {
    const d = detectaSDTurbo({ hayWebGPU: true, hayAdaptador: true, f16: true });
    expect(d.puede).toBe(true);
    expect(d.motivo).toMatch(/2,3 GB/);
  });
});

describe("plan de pesos", () => {
  it("en caché no se descarga; sin permiso se pide; sin espacio no se baja", () => {
    expect(planPesos({ enCache: true, permiso: false, cuotaLibreBytes: 0 }).accion).toBe("usar-cache");
    expect(planPesos({ enCache: false, permiso: false, cuotaLibreBytes: null }).accion).toBe("pedir-permiso");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: null }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 2 }).accion).toBe("sin-espacio");
    expect(planPesos({ enCache: false, permiso: true, cuotaLibreBytes: BYTES_PESOS_SD_TURBO * 3 }).accion).toBe("descargar");
  });
});

describe("flujo completo con el motor simulado", () => {
  it("sin WebGPU usa las demás capas y ni mira la caché", async () => {
    const o: Simulado = { llamadas: [], sondas: { hayWebGPU: false, hayAdaptador: false, f16: false } };
    const r = await generaEnPestana(motorSimulado(o), PETICION);
    expect(r).toMatchObject({ ok: false, accion: "sin-webgpu" });
    expect(o.llamadas).toEqual(["sondear"]);
  });
  it("sin permiso se pide permiso y no se descarga", async () => {
    const o: Simulado = { llamadas: [], enCache: false };
    const r = await generaEnPestana(motorSimulado(o), PETICION);
    expect(r.accion).toBe("pedir-permiso");
    expect(o.llamadas).toEqual(["sondear", "cache", "cuota"]);
  });
  it("sin espacio no se descarga aunque haya permiso", async () => {
    const o: Simulado = { llamadas: [], enCache: false, cuota: 1 };
    const r = await generaEnPestana(motorSimulado(o), { ...PETICION, permisoDescarga: true });
    expect(r.accion).toBe("sin-espacio");
    expect(o.llamadas).not.toContain("descargar");
  });
  it("una descarga que falla lo dice y cae a las demás capas", async () => {
    const o: Simulado = { llamadas: [], enCache: false, fallaDescarga: true };
    const r = await generaEnPestana(motorSimulado(o), { ...PETICION, permisoDescarga: true });
    expect(r.ok).toBe(false);
    expect(r.accion).toBe("error");
    expect(r.motivo).toMatch(/No se pudieron descargar/);
    expect(o.llamadas).not.toContain("generar");
  });
  it("con los pesos en caché genera sin descargar", async () => {
    const o: Simulado = { llamadas: [], enCache: true };
    const r = await generaEnPestana(motorSimulado(o), PETICION);
    expect(r).toMatchObject({ ok: true, accion: "listo", imagen: IMAGEN });
    expect(o.llamadas).toEqual(["sondear", "cache", "cuota", "generar"]);
  });
  it("con permiso, espacio y descarga correcta acaba en imagen", async () => {
    const o: Simulado = { llamadas: [], enCache: false, cuota: BYTES_PESOS_SD_TURBO * 4 };
    const r = await generaEnPestana(motorSimulado(o), { ...PETICION, permisoDescarga: true });
    expect(r.ok).toBe(true);
    expect(o.llamadas).toEqual(["sondear", "cache", "cuota", "descargar", "generar"]);
  });
  it("si la GPU falla al generar, se dice y se usan las demás capas", async () => {
    const o: Simulado = { llamadas: [], enCache: true, fallaGeneracion: true };
    const r = await generaEnPestana(motorSimulado(o), PETICION);
    expect(r.accion).toBe("error");
    expect(r.motivo).toMatch(/no pudo generar/);
  });
});

describe("cuentas puras del worker", () => {
  it("urlPeso no duplica barras y apunta al repo verificado", () => {
    expect(urlPeso("/unet/model.onnx")).toBe(`${REPO_ONNX_SD_TURBO}/unet/model.onnx`);
    expect(PESOS_SD_TURBO).toHaveLength(3);
  });
  it("el ruido es determinista por semilla, finito y del tamaño pedido", () => {
    const a = ruidoConSemilla(7, 32);
    const b = ruidoConSemilla(7, 32);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    expect(a.every((x) => Number.isFinite(x))).toBe(true);
    expect(ruidoConSemilla(8, 32)).not.toEqual(a);
    expect(ruidoConSemilla(7, 0)).toHaveLength(0);
  });
  it("escalaEntrada divide por sqrt(sigma²+1) y el paso de Euler por la escala del VAE", () => {
    expect(Array.from(escalaEntrada(new Float32Array([2]), 1))[0]).toBeCloseTo(Math.SQRT2);
    const paso = pasoEuler(new Float32Array([0.5]), new Float32Array([1]), 1);
    expect(paso[0]).toBeCloseTo(0.5 / 0.18215);
    expect(() => pasoEuler(new Float32Array([1]), new Float32Array([1, 2]))).toThrow();
  });
  it("aPixelesRGB pasa de NCHW 0..1 a RGB 0..255 con recorte", () => {
    const blancoYNegro = aPixelesRGB(new Float32Array([-1, 1, 0, 0, 1, -1]), 2, 1);
    expect(Array.from(blancoYNegro)).toEqual([0, 128, 255, 255, 128, 0]);
    expect(() => aPixelesRGB(new Float32Array([0]), 2, 2)).toThrow();
  });
});
