import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { elegirNeurona, trabajoDeAccion } from "../accion-render";
import { validarTrabajo } from "../trabajo";

const fuente = readFileSync(path.join(__dirname, "../accion-render.ts"), "utf8");

describe("trabajoDeAccion", () => {
  it("la forma corta da un trabajo que validarTrabajo acepta, con origen Astraura", () => {
    const r = trabajoDeAccion({ forma: "esfera", material: "cristal", color: "#7aa2ff", salida: "ambos", ancho: 1920, alto: 1080 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validarTrabajo(r.trabajo).ok).toBe(true);
    expect(r.trabajo.origen).toBe("astraura");
    expect(r.trabajo.quien).toBe("agente");
    expect(r.trabajo.ambito).toBe("personal");
    expect(r.trabajo.calidad).toBe("normal");
    expect(r.trabajo.salidas.map((s) => s.tipo)).toEqual(["render_png", "exportar_glb"]);
    expect(r.trabajo.escena.some((o) => o.op === "primitiva")).toBe(true);
  });

  it("con solo la forma usa los valores por defecto: 1280×720, Cycles CPU y 32 muestras", () => {
    const r = trabajoDeAccion({ forma: "cubo" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const png = r.trabajo.salidas[0];
    expect(png.tipo).toBe("render_png");
    expect(png.ancho).toBe(1280);
    expect(png.alto).toBe(720);
    expect(png.motor).toBe("cycles-cpu");
    expect(png.muestras).toBe(32);
  });

  it("la forma corta monta escena, color español, material, cámara, sol y fondo", () => {
    const r = trabajoDeAccion({ forma: "cono", color: "rojo", material: "metal" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = r.trabajo.escena.map((o) => o.op);
    expect(ops).toEqual(["primitiva", "material", "camara", "luz", "mundo"]);
    const material = r.trabajo.escena.find((o) => o.op === "material");
    expect(material?.metalico).toBe(1);
    expect(material?.rugosidad).toBe(0.25);
  });

  it("un trabajo completo inválido contesta con el motivo del validador", () => {
    const r = trabajoDeAccion({ trabajo: { v: 1, titulo: "", calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente", escena: [], salidas: [] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("titulo");
  });

  it("una forma desconocida da el motivo en español", () => {
    const r = trabajoDeAccion({ forma: "dodecaedro" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("cubo");
  });

  it("un color mal formado (o no reconocido) se rechaza mencionando el color", () => {
    for (const color of ["#12g45z", "verde lima", "chartreuse", "#7aa2"]) {
      const r = trabajoDeAccion({ forma: "cubo", color });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("color");
    }
  });

  it("tamaños fuera de rango dan su motivo sin construir el trabajo", () => {
    for (const args of [{ forma: "cubo", ancho: 8192 }, { forma: "cubo", alto: 8000 }, { forma: "cubo", ancho: 12.5 }]) {
      const r = trabajoDeAccion(args);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/píxeles/);
    }
  });
});

describe("elegirNeurona", () => {
  it("con 0 neuronas: «próximamente»", () => {
    const r = elegirNeurona([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("próximamente");
  });

  it("elige la PRIMERA que tenga Blender instalado y perfil distinto de «ninguno»", () => {
    const r = elegirNeurona([
      { nombre: "Web", capabilities: { blender: { instalado: false, perfil: "ninguno" } } },
      { nombre: "Móvil", capabilities: { blender: { instalado: true, perfil: "ninguno" } } },
      { nombre: "Mac", capabilities: { blender: { instalado: true, perfil: "estandar" } } },
    ]);
    expect(r).toEqual({ ok: true, neurona: "Mac" });
  });

  it("sin ninguna capaz dice «ninguna de tus neuronas tiene Blender»", () => {
    const r = elegirNeurona([
      { nombre: "Web" },
      { nombre: "Tablet", capabilities: { blender: { instalado: false } } },
      { nombre: "A1", capabilities: {} },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("ninguna de tus neuronas tiene Blender");
  });
});

it("el módulo es puro: no contiene node:", () => {
  expect(fuente).not.toContain("node:");
});
