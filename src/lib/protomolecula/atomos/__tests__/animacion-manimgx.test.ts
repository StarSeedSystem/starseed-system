/**
 * Prueba del átomo «Animación 3D (ManimGX)» (MGX1023C): registro, saneo de parámetros,
 * escena de Manim determinista y salida honesta de la acción «renderizar». Todo puro.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ANIMACION_MANIMGX, planRender, escenaDesdeValores, espiralAurea, renderizarAnimacion,
} from "../animacion-manimgx";
import { limpiarRegistro, registrarAtomo } from "../../registro-atomos";

describe("átomo «Animación 3D (ManimGX)»", () => {
  beforeEach(() => limpiarRegistro());

  it("la definición pasa el registro y declara el contrato del átomo", () => {
    expect(registrarAtomo(ANIMACION_MANIMGX)).toEqual({ ok: true });
    expect(ANIMACION_MANIMGX.categoria).toBe("3d");
    expect(ANIMACION_MANIMGX.integracion).toBe("wasm-en-worker");
    expect(ANIMACION_MANIMGX.control).toBe("total");
    expect(ANIMACION_MANIMGX.entradas).toEqual([]);
    expect(ANIMACION_MANIMGX.salidas).toEqual(["mp4"]);
    expect(ANIMACION_MANIMGX.parametros.map((p) => p.id)).toEqual([
      "calidad", "fps", "duracion", "rotacion-camara", "fondo", "renderizar",
    ]);
  });

  it("planRender cae en los defectos ante valores vacíos o rotos", () => {
    const p = planRender({});
    expect(p.calidad).toBe("media");
    expect(p.fps).toBe(30);
    expect(p.duracionSegundos).toBe(10);
    expect(p.rotacionGrados).toBe(45);
    expect(p.fondoHex).toBe("#0b0b14");
    expect(planRender({ fps: Number.NaN, calidad: "ultra", fondo: "#123" })).toMatchObject({
      fps: 30, calidad: "media", fondoHex: "#0b0b14",
    });
  });

  it("planRender acota lo que se pasa de rango", () => {
    expect(planRender({ fps: 120, duracion: 500, "rotacion-camara": -10 })).toMatchObject({
      fps: 60, duracionSegundos: 120, rotacionGrados: 0,
    });
    expect(planRender({ fps: 12.49, calidad: "alta" })).toMatchObject({ fps: 12, calidad: "alta", altura: 1080, anchura: 1920 });
  });

  it("espiralAurea reparte en la esfera con el paso del ángulo áureo", () => {
    const pts = espiralAurea(48, 2);
    expect(pts).toHaveLength(48);
    for (const [x, y, z] of pts) {
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(2, 2);
      expect(y).toBeLessThanOrEqual(2);
      expect(y).toBeGreaterThanOrEqual(-2);
    }
    const golden = Math.PI * (3 - Math.sqrt(5));
    const acimut = (i: number) => Math.atan2(pts[i][2], pts[i][0]);
    for (let i = 0; i < pts.length - 1; i++) {
      let paso = acimut(i + 1) - acimut(i);
      paso = paso < 0 ? paso + 2 * Math.PI : paso;
      expect(Math.abs(paso - golden), `punto ${i}`).toBeLessThan(1e-2);
    }
  });

  it("escenaDesdeValores produce código determinista con la configuración pedida", () => {
    const a = escenaDesdeValores({});
    expect(escenaDesdeValores({})).toEqual(a);
    expect(a.codigoPython).toContain("from manim import *");
    expect(a.codigoPython).toContain("config.frame_rate = 30");
    expect(a.codigoPython).toContain('config.background_color = "#0b0b14"');
    expect(a.codigoPython).toContain("class Animacion(ThreeDScene):");
    expect(a.codigoPython).toContain("begin_ambient_camera_rotation");
    expect(a.codigoPython).toContain("self.wait(10)");
    expect(a.duracionMaxSegundos).toBe(Math.ceil(10 + 1.5));
    const b = escenaDesdeValores({ fps: 60, fondo: "blanco", duracion: 20, "rotacion-camara": 90 });
    expect(b.codigoPython).toContain("config.frame_rate = 60");
    expect(b.codigoPython).toContain('config.background_color = "#ffffff"');
    expect(b.codigoPython).toContain("self.wait(20)");
    expect(b.duracionMaxSegundos).toBe(22);
  });

  it("renderizarAnimacion da una salida mp4 honesta en un medio sin WebGPU", async () => {
    const r = await renderizarAnimacion(escenaDesdeValores({}));
    expect(r.formato).toBe("mp4");
    expect(r.bytes).toBeNull();
    expect(r.cancelado).toBe(false);
    expect(typeof r.error).toBe("string");
    expect(r.error?.length).toBeGreaterThan(0);
  });
});
