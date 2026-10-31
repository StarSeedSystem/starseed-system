import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { elegirNeurona, trabajoDeAccion } from "../accion-render";
import { validarTrabajo } from "../trabajo";
import type { Trabajo3D } from "../trabajo";

type Bruto = Record<string, unknown>;
const ok = (b: unknown): Trabajo3D => { const r = trabajoDeAccion(b as Bruto); expect(r.ok, "motivo" in r ? r.motivo : "").toBe(true); return (r as { ok: true; trabajo: Trabajo3D }).trabajo; };
const motivo = (b: unknown): string => { const r = trabajoDeAccion(b as Bruto); expect(r.ok).toBe(false); return (r as { ok: false; motivo: string }).motivo; };
const trabajoInvalido: Bruto = {
  v: 1, titulo: "_tr", calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente",
  escena: [{ op: "brujeria" }], salidas: [{ tipo: "render_png", ancho: 128, alto: 128, muestras: 4, motor: "workbench" }],
};

describe("trabajoDeAccion", () => {
  it("la forma corta compone un trabajo que validarTrabajo acepta", () => {
    const t = ok({ forma: "esfera", material: "cristal", color: "#7AA2FF", salida: "png" });
    expect(validarTrabajo(t).ok).toBe(true);
    expect(t).toMatchObject({ v: 1, calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente" });
    expect(t.escena[0]).toMatchObject({ op: "primitiva", tipo: "esfera", nombre: "objeto", tam: 1 });
    expect(t.escena[1]).toMatchObject({ op: "material", objeto: "objeto", metalico: 0, rugosidad: 0, alfa: 0.4 });
    expect(t.escena.some((o) => o.op === "camara")).toBe(true);
    expect(t.escena.some((o) => o.op === "luz")).toBe(true);
    expect(t.escena.some((o) => o.op === "mundo")).toBe(true);
    expect(t.salidas).toMatchObject([{ tipo: "render_png", ancho: 1280, alto: 720, muestras: 32, motor: "cycles-cpu" }]);
  });

  it("salida glb y ambos cambian las salidas; el color con nombre y con tilde se entiende", () => {
    const glb = ok({ forma: "cubo", salida: "glb" });
    expect(glb.salidas.map((s) => s.tipo)).toEqual(["exportar_glb"]);
    const ambos = ok({ forma: "cono", salida: "ambos", color: "marrón" });
    expect(ambos.salidas.map((s) => s.tipo)).toEqual(["render_png", "exportar_glb"]);
    expect(ambos.escena[1]).toMatchObject({ op: "material", color: [0.5, 0.33, 0.2, 1], metalico: 0, rugosidad: 0.9, alfa: 1 });
  });

  it("un trabajo completo se valida tal cual; inválido, da motivo", () => {
    const t = ok({ forma: "toro" });
    const completo = ok({ trabajo: JSON.parse(JSON.stringify(t)) as unknown });
    expect(completo.origen).toBe("astraura");
    expect(completo.escena.map((o) => o.op)).toEqual(t.escena.map((o) => o.op));
    const m = motivo({ trabajo: trabajoInvalido });
    expect(m).toContain("No acepté ese trabajo 3D");
    expect(m).toContain("desconocida");
  });

  it("forma desconocida, color mal formado y tamaños/salida/motor erróneos dan motivo en español", () => {
    expect(motivo({ forma: "dodecaedro" })).toContain("Forma desconocida");
    expect(motivo({})).toContain("Forma desconocida");
    expect(motivo({ forma: "cubo", color: "#12" })).toContain("Color no válido");
    expect(motivo({ forma: "cubo", color: "azulado" })).toContain("Color no válido");
    expect(motivo({ forma: "cubo", color: 5 })).toContain("Color no válido");
    expect(motivo({ forma: "cubo", ancho: 5000 })).toContain("ancho");
    expect(motivo({ forma: "cubo", alto: 5 })).toContain("alto");
    expect(motivo({ forma: "cubo", salida: "gif" })).toContain("salida no válida");
    expect(motivo({ forma: "cubo", motor: "raytracing" })).toContain("motor no válido");
    expect(motivo({ forma: "esfera", material: "goma" })).toContain("Material desconocido");
  });
});

describe("elegirNeurona", () => {
  it("sin neuronas o sin Blender da el motivo de próximamente", () => {
    const ningunB = "Próximamente: ninguna de tus neuronas tiene Blender.";
    expect(motivoNeurona([])).toBe(ningunB);
    expect(motivoNeurona([{ nombre: "Web", capabilities: {} }])).toBe(ningunB);
    expect(motivoNeurona([{ nombre: "Web", capabilities: { blender: { instalado: false, perfil: "ligero" } } }])).toBe(ningunB);
    expect(motivoNeurona([{ nombre: "A1", capabilities: { blender: { instalado: true, perfil: "ninguno" } } }])).toBe(ningunB);
  });

  it("elige la primera con Blender instalado y perfil distinto de ninguno", () => {
    const caps = (v: unknown) => ({ blender: v }) as unknown as Record<string, unknown>;
    expect(elegirNeurona([{ nombre: "Mac", capabilities: caps({ instalado: true, perfil: "ligero" }) }])).toEqual({ ok: true, neurona: "Mac" });
    expect(elegirNeurona([
      { nombre: "Teléfono", capabilities: caps({ instalado: false }) },
      { nombre: "Estudio", capabilities: caps({ instalado: true, perfil: "estandar" }) },
    ])).toEqual({ ok: true, neurona: "Estudio" });
  });
});

describe("el módulo accion-render", () => {
  it("no contiene Node ni construcción de código", () => {
    const fuente = readFileSync(new URL("../accion-render.ts", import.meta.url), "utf8");
    expect(fuente).not.toContain("node:");
    expect(fuente).not.toContain("child_process");
    expect(fuente).not.toContain("execFile");
  });
});

export function motivoNeurona(l: Parameters<typeof elegirNeurona>[0]): string { const r = elegirNeurona(l); expect(r.ok).toBe(false); return (r as { ok: false; motivo: string }).motivo; }
