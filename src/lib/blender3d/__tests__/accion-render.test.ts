import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { trabajoDeAccion, elegirNeurona } from "../accion-render";
import { validarTrabajo } from "../trabajo";
import type { Trabajo3D } from "../trabajo";

type Bruto = Record<string, unknown>;
const corto = (extra: Bruto = {}): Bruto => ({
  forma: "esfera", material: "cristal", color: "#7aa2ff", salida: "png", ...extra,
});
const valido = (r: ReturnType<typeof trabajoDeAccion>): Trabajo3D => {
  expect(r.ok).toBe(true);
  return (r as { ok: true; trabajo: Trabajo3D }).trabajo;
};
const motivo = (r: ReturnType<typeof trabajoDeAccion>): string => {
  expect(r.ok).toBe(false);
  return (r as { ok: false; motivo: string }).motivo;
};
const trablado = (escena: unknown[]): Bruto => ({
  v: 1, titulo: "Escena", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
  escena, salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }],
});

describe("trabajoDeAccion · forma corta", () => {
  it("la forma corta del ejemplo da un trabajo que validarTrabajo acepta", () => {
    const t = valido(trabajoDeAccion(corto()));
    const v = validarTrabajo(t);
    expect(v.ok).toBe(true);
    expect(t.origen).toBe("astraura");
    expect(t.quien).toBe("agente");
    expect(t.ambito).toBe("personal");
    expect(t.salidas.map((s) => s.tipo)).toEqual(["render_png"]);
  });
});

describe("trabajoDeAccion · rechazos", () => {
  it("forma desconocida da su motivo en español", () => {
    const m = motivo(trabajoDeAccion(corto({ forma: "dodecaedro" })));
    expect(m).toContain("Forma desconocida");
  });
  it("un trabajo completo inválido da motivo en español", () => {
    const m = motivo(trabajoDeAccion({ trabajo: { ...trablado([{ op: "remallar", objeto: "x" }]) } }));
    expect(m).toContain("El trabajo 3D no vale");
    expect(m).toContain("próximamente");
  });
  it("un trabajo completo válido pasa tal cual", () => {
    const t = valido(trabajoDeAccion({ trabajo: trablado([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }]) }));
    expect(t.escena.map((o) => o.op)).toEqual(["primitiva"]);
  });
  it("color mal formado y material, motor o salida desconocidos dan motivo", () => {
    expect(motivo(trabajoDeAccion(corto({ color: "#abc" })))).toContain("Color no válido");
    expect(motivo(trabajoDeAccion(corto({ color: "chartreuse" })))).toContain("Color no válido");
    expect(motivo(trabajoDeAccion(corto({ material: "holográfico" })))).toContain("Material no válido");
    expect(motivo(trabajoDeAccion(corto({ motor: "octane" })))).toContain("Motor no válido");
    expect(motivo(trabajoDeAccion(corto({ salida: "exr" })))).toContain("Salida no válida");
  });
  it("tamaños fuera de rango dan motivo en español", () => {
    expect(motivo(trabajoDeAccion(corto({ ancho: 8 })))).toContain("Tamaño fuera de rango");
    expect(motivo(trabajoDeAccion(corto({ alto: 5000 })))).toContain("Tamaño fuera de rango");
  });
  it("la forma corta compone primitiva, material, cámara, sol, mundo y salidas", () => {
    const t = valido(trabajoDeAccion(corto({ salida: "ambos", alto: 1080 })));
    expect(t.escena.map((o) => o.op)).toEqual(["primitiva", "material", "camara", "luz", "mundo"]);
    expect(t.salidas.map((s) => s.tipo)).toEqual(["render_png", "exportar_glb"]);
    expect(Number(t.salidas[0].ancho)).toBe(1280);
    expect(Number(t.salidas[0].alto)).toBe(1080);
    expect(t.salidas[0].motor).toBe("cycles-cpu");
    expect(Number(t.salidas[0].muestras)).toBe(32);
  });
  it("sólo glb da exportar_glb sin render_png", () => {
    const t = valido(trabajoDeAccion(corto({ salida: "glb" })));
    expect(t.salidas.map((s) => s.tipo)).toEqual(["exportar_glb"]);
  });
});

describe("elegirNeurona", () => {
  const fallo = (r: ReturnType<typeof elegirNeurona>): { ok: false; motivo: string } => {
    expect(r.ok).toBe(false);
    return r as { ok: false; motivo: string };
  };
  it("sin neuronas dice «próximamente»", () => {
    expect(fallo(elegirNeurona([])).motivo).toBe("próximamente: ninguna de tus neuronas tiene Blender");
  });
  it("salta las neuronas sin Blender y con perfil «ninguno»", () => {
    const sin = { nombre: "Escritorio", capabilities: {} };
    const apagada = { nombre: "A1", capabilities: { blender: { instalado: true, perfil: "ninguno" } } };
    expect(fallo(elegirNeurona([sin, apagada])).motivo).toBe("próximamente: ninguna de tus neuronas tiene Blender");
  });
  it("elige la primera neurona con Blender instalado y perfil válido", () => {
    const lista = [
      { nombre: "Web", capabilities: {} },
      { nombre: "A1", capabilities: { blender: { instalado: true, perfil: "ligero" } } },
      { nombre: "Mac", capabilities: { blender: { instalado: true, perfil: "estudio" } } },
    ];
    expect(elegirNeurona(lista)).toEqual({ ok: true, neurona: "A1" });
    expect(elegirNeurona([lista[2]])).toEqual({ ok: true, neurona: "Mac" });
  });
});

describe("higiene del módulo", () => {
  it("accion-render.ts no importa nada de node:", () => {
    const fuente = readFileSync("src/lib/blender3d/accion-render.ts", "utf8");
    expect(/["']node:[^"']*["']/.test(fuente)).toBe(false);
    expect(/require\s*\(/.test(fuente)).toBe(false);
  });
});
