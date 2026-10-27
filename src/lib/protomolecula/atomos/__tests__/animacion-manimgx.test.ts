/**
 * Prueba pura del átomo «Animación 3D (ManimGX)»: registro y parámetros del átomo,
 * plan de renderizado (misma entrada, mismo plan) y la acción «renderizar» que
 * devuelve el resultado de cliente-render. Sin red, sin disco, sin código ejecutado.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ANIMACION_MANIMGX, COLORES_FONDO, planAnimacion, renderizarAnimacion } from "../animacion-manimgx";
import { limpiarRegistro, obtenerAtomo, registrarAtomo } from "@/lib/protomolecula/registro-atomos";

const entrada = { nombre: "espiral áurea", codigoPython: "def construir(self): ..." };

describe("átomo animación 3D (ManimGX)", () => {
  beforeEach(() => limpiarRegistro());

  it("la definición se registra y queda en el registro", () => {
    expect(registrarAtomo(ANIMACION_MANIMGX)).toEqual({ ok: true });
    expect(obtenerAtomo("animacion-manimgx")).toBe(ANIMACION_MANIMGX);
  });

  it("declara calidad, fps, duración, rotación de cámara y color de fondo con sus rangos", () => {
    const ids = ANIMACION_MANIMGX.parametros.map((p) => p.id);
    expect(ids).toEqual(["calidad", "fps", "duracion", "rotacion-camara", "color-fondo"]);
    const calidad = ANIMACION_MANIMGX.parametros.find((p) => p.id === "calidad");
    expect(calidad?.tipo).toBe("opcion");
    expect(calidad?.opciones).toEqual(["borrador", "media", "alta"]);
    expect(calidad?.defecto).toBe("media");
    const fps = ANIMACION_MANIMGX.parametros.find((p) => p.id === "fps");
    expect(fps?.unidad).toBe("fps");
    expect(fps?.defecto).toBe(30);
    const rot = ANIMACION_MANIMGX.parametros.find((p) => p.id === "rotacion-camara");
    expect(rot?.unidad).toBe("grados");
    expect(rot?.defecto).toBe(0);
    const fondo = ANIMACION_MANIMGX.parametros.find((p) => p.id === "color-fondo");
    expect(fondo?.opciones).toEqual(Object.keys(COLORES_FONDO));
  });

  it("el MP4 es la salida del átomo y la ficha dice la licencia honesta", () => {
    expect(ANIMACION_MANIMGX.salidas).toEqual(["mp4"]);
    expect(ANIMACION_MANIMGX.entradas).toEqual([]);
    expect(ANIMACION_MANIMGX.categoria).toBe("3d");
    expect(ANIMACION_MANIMGX.ficha?.repo).toContain("manimgx");
  });

  it("el plan usa los defectos cuando faltan valores y acota los extremos", () => {
    const plan = planAnimacion(entrada);
    expect(plan.calidad).toBe("media");
    expect(plan.fps).toBe(30);
    expect(plan.duracionMaxSegundos).toBe(5);
    expect(plan.rotacionCamaraGrados).toBe(0);
    expect(plan.colorFondo).toBe("noche");
    expect(plan.colorFondoHex).toBe(COLORES_FONDO.noche);
    const extremo = planAnimacion({ ...entrada, valores: { fps: 240, duracion: 90, "rotacion-camara": 450, calidad: "borrador", "color-fondo": "ambar" } });
    expect(extremo.fps).toBe(60);
    expect(extremo.duracionMaxSegundos).toBe(60);
    expect(extremo.rotacionCamaraGrados).toBe(360);
    expect(extremo.colorFondoHex).toBe(COLORES_FONDO.ambar);
  });

  it("la misma entrada da el mismo plan, y una escena vacía trae aviso", () => {
    expect(planAnimacion(entrada)).toEqual(planAnimacion(entrada));
    const vacio = planAnimacion({ nombre: "m", codigoPython: "   " });
    expect(vacio.avisos.some((a) => a.includes("sin código"))).toBe(true);
  });

  it("la acción renderizar devuelve el resultado honesto de cliente-render con el MP4 a null si no hay WebGPU", async () => {
    const accion = await renderizarAnimacion(entrada);
    expect(accion.resultado.escena).toBe("espiral áurea");
    expect(typeof accion.resultado.cancelado).toBe("boolean");
    if (!accion.puedeRenderizar) {
      expect(accion.resultado.bytes).toBeNull();
      expect(typeof accion.resultado.error).toBe("string");
      expect(accion.avisos.some((a) => a.includes("WebGPU"))).toBe(true);
    }
    expect(accion.escena.nombre).toBe("espiral áurea");
    expect(accion.escena.codigoPython).toBe(entrada.codigoPython);
  });
});
