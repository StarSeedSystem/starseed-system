/**
 * Prueba pura del átomo «Animación 3D (ManimGX)»: el registro acepta la definición y
 * `planRenderizar` acota parámetros y arma el plan del MP4 sin ejecutar nada.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ANIMACION_MANIMGX, planRenderizar } from "../animacion-manimgx";
import { limpiarRegistro, registrarAtomo } from "../../registro-atomos";

const entradaBase = {
  valores: {},
  codigoPython: "class Saludo(Scene):\n    def construct(self): self.add(Circle())",
  nombre: "saludo-3d",
  ahora: 1000,
};

describe("átomo Animación 3D (ManimGX)", () => {
  beforeEach(() => limpiarRegistro());

  it("la definición pasa el registro y declara parámetros y salida MP4", () => {
    expect(registrarAtomo(ANIMACION_MANIMGX)).toEqual({ ok: true });
    expect(ANIMACION_MANIMGX.categoria).toBe("3d");
    expect(ANIMACION_MANIMGX.integracion).toBe("wasm-en-worker");
    expect(ANIMACION_MANIMGX.salidas).toContain("mp4");
    const ids = ANIMACION_MANIMGX.parametros.map((p) => p.id);
    expect(ids).toEqual(["calidad", "fps", "duracion", "rotacion-camara", "color-fondo", "renderizar"]);
  });

  it("planRenderizar aplica los defectos con valores vacíos", () => {
    const plan = planRenderizar(entradaBase);
    expect(plan.calidad).toBe("normal");
    expect(plan.fps).toBe(30);
    expect(plan.duracionS).toBe(5);
    expect(plan.rotacionGrados).toBe(0);
    expect(plan.colorFondo).toBe("negro");
    expect(plan.escena.nombre).toBe("saludo-3d");
    expect(plan.cliente.topeTiempoMs).toBe(120000);
    expect(plan.avisos).toEqual([]);
  });

  it("acota fps, duración y rotación al rango declarado", () => {
    const plan = planRenderizar({ ...entradaBase, valores: { fps: 500, duracion: 300, "rotacion-camara": -400 } });
    expect(plan.fps).toBe(120);
    expect(plan.duracionS).toBe(60);
    expect(plan.rotacionGrados).toBe(-180);
  });

  it("un valor no finito cae al defecto del parámetro", () => {
    // NaN no es finito: sale 30, no NaN (evita un plan roto).
    const plan = planRenderizar({ ...entradaBase, valores: { fps: Number.NaN } });
    expect(plan.fps).toBe(30);
  });

  it("la calidad elegida fija su tope de tiempo en el cliente", () => {
    const borrador = planRenderizar({ ...entradaBase, valores: { calidad: "borrador" } });
    expect(borrador.cliente.topeTiempoMs).toBe(30000);
    const alta = planRenderizar({ ...entradaBase, valores: { calidad: "alta" } });
    expect(alta.cliente.topeTiempoMs).toBe(300000);
  });

  it("el plan es puro: misma entrada, mismo plan", () => {
    expect(planRenderizar(entradaBase)).toEqual(planRenderizar(entradaBase));
  });

  it("avisa y nombra la escena saneada cuando el código Python viene vacío", () => {
    const plan = planRenderizar({ ...entradaBase, codigoPython: "  ", nombre: "" });
    expect(plan.avisos).toContain("Sin código Python de la escena el cliente-render no tiene qué animar.");
    expect(plan.escena.nombre).toBe("escena");
  });

  it("la duración máxima de la escena coincide con la duración acotada", () => {
    const plan = planRenderizar({ ...entradaBase, valores: { duracion: 12.34 } });
    expect(plan.escena.duracionMaxSegundos).toBe(12.34);
    expect(plan.escena.codigoPython).toContain("Scene");
  });
});
