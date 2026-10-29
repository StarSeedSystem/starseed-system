import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDirectives } from "@/lib/aurora/actions";
import { elegirNeurona, trabajoDeAccion } from "../accion-render";
import { validarTrabajo, type Trabajo3D } from "../trabajo";

const valido = (bruto: unknown): Trabajo3D => {
  const r = validarTrabajo(bruto);
  expect(r.ok).toBe(true);
  return (r as { ok: true; trabajo: Trabajo3D }).trabajo;
};

const neurona = (nombre: string, blender?: Record<string, unknown>) => ({
  nombre,
  capabilities: blender ? { blender } : {},
});

describe("trabajoDeAccion · forma corta", () => {
  it("compone un trabajo que acepta validarTrabajo", () => {
    const r = trabajoDeAccion({ forma: "esfera", material: "cristal", color: "#7aa2ff", salida: "png" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = valido(r.trabajo);
    expect(t.origen).toBe("astraura");
    expect(t.quien).toBe("agente");
    expect(t.ambito).toBe("personal");
    expect(t.titulo).toBe("Render 3D de esfera");
    expect(t.escena.map((o) => o.op)).toEqual(["primitiva", "material", "camara", "luz", "mundo"]);
    const primitiva = t.escena[0];
    const material = t.escena[1];
    expect(primitiva.tipo).toBe("esfera");
    expect(material.alfa).toBe(0.35);
    expect(t.salidas).toHaveLength(1);
    expect(t.salidas[0]).toMatchObject({ tipo: "render_png", ancho: 1280, alto: 720, muestras: 32, motor: "cycles-cpu" });
  });

  it("acepta nombres de color en español y ambos formatos de salida", () => {
    const r = trabajoDeAccion({ forma: "toro", color: "azul", material: "metal", salida: "ambos", ancho: 1920, alto: 1080 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = valido(r.trabajo);
    expect(t.salidas.map((s) => s.tipo)).toEqual(["render_png", "exportar_glb"]);
    expect(t.salidas[0]).toMatchObject({ ancho: 1920, alto: 1080 });
    expect(t.escena[1]).toMatchObject({ metalico: 1, rugosidad: 0.25, alfa: 1 });
  });

  it("con salida glb solo exporta el modelo", () => {
    const r = trabajoDeAccion({ forma: "cubo", salida: "glb" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(valido(r.trabajo).salidas.map((s) => s.tipo)).toEqual(["exportar_glb"]);
  });
});

describe("trabajoDeAccion · trabajo completo", () => {
  it("acepta un trabajo completo y lo valida tal cual", () => {
    const completo = {
      v: 1, titulo: "Mi escena", calidad: "borrador", ambito: "perfil", origen: "estudio", quien: "persona",
      escena: [
        { op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 },
        { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] },
        { op: "luz", nombre: "sol", tipo: "sol", energia: 3 },
      ],
      salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }],
    };
    const r = trabajoDeAccion({ trabajo: completo });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trabajo.titulo).toBe("Mi escena");
    expect(r.trabajo.origen).toBe("estudio");
  });

  it("rechaza un trabajo completo inválido con motivo", () => {
    const r = trabajoDeAccion({ trabajo: { v: 2 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo.length).toBeGreaterThan(0);
    expect(r.motivo).toContain("v debe ser");
  });
});

describe("trabajoDeAccion · rechazos", () => {
  it("rechaza una forma desconocida", () => {
    const r = trabajoDeAccion({ forma: "dodecaedro" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("Forma desconocida");
  });
  it("rechaza un color mal formado", () => {
    for (const color of ["#12345", "#gggggg", "fucsia-inventado"]) {
      const r = trabajoDeAccion({ forma: "cubo", color });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.motivo).toContain("Color no válido");
    }
  });
  it("rechaza tamaños fuera de rango, materiales y motores desconocidos", () => {
    const ancho = trabajoDeAccion({ forma: "cubo", ancho: 4 });
    expect(ancho.ok).toBe(false);
    if (!ancho.ok) expect(ancho.motivo).toContain("ancho");
    const alto = trabajoDeAccion({ forma: "cubo", alto: 9999 });
    expect(alto.ok).toBe(false);
    if (!alto.ok) expect(alto.motivo).toContain("alto");
    const material = trabajoDeAccion({ forma: "cubo", material: "plastico" });
    expect(material.ok).toBe(false);
    if (!material.ok) expect(material.motivo).toContain("Material desconocido");
    const motor = trabajoDeAccion({ forma: "cubo", motor: "magia" });
    expect(motor.ok).toBe(false);
    if (!motor.ok) expect(motor.motivo).toContain("Motor desconocido");
  });
  it("sin forma ni trabajo pide una de las dos", () => {
    const r = trabajoDeAccion({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("Indica una forma");
  });
});

describe("elegirNeurona", () => {
  it("con cero neuronas dice próximamente", () => {
    const r = elegirNeurona([]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("próximamente: ninguna de tus neuronas tiene Blender");
  });
  it("ignora neuronas sin Blender y con perfil ninguno", () => {
    expect(elegirNeurona([neurona("mac", { instalado: false, perfil: "estandar" })]).ok).toBe(false);
    expect(elegirNeurona([neurona("mac", { instalado: true, perfil: "ninguno" })]).ok).toBe(false);
    expect(elegirNeurona([neurona("mac")]).ok).toBe(false);
  });
  it("elige la primera con Blender instalado y perfil distinto de ninguno", () => {
    const r = elegirNeurona([
      neurona("web", { instalado: false, perfil: "ninguno" }),
      neurona("mac", { instalado: true, perfil: "estandar" }),
      neurona("a1", { instalado: true, perfil: "ligero" }),
    ]);
    expect(r).toEqual({ ok: true, neurona: "mac" });
  });
});

describe("render_3d · directiva de Astraura", () => {
  it("el parser reconoce el nombre con dígito y el trabajo se compone", () => {
    const texto = '[[ACCION: render_3d {"forma":"esfera","material":"cristal","color":"#7aa2ff","salida":"png"}]]';
    const [directiva] = parseDirectives(texto);
    expect(directiva?.name).toBe("render_3d");
    const r = trabajoDeAccion(directiva.args);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(valido(r.trabajo).origen).toBe("astraura");
  });
});

describe("accion-render.ts", () => {
  it("no contiene node:, eval( ni new Function", () => {
    const fuente = readFileSync(new URL("../accion-render.ts", import.meta.url), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function"]) expect(fuente).not.toContain(prohibido);
  });
});
