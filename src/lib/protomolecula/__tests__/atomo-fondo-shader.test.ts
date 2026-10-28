import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ATOMOS_PROPIOS } from "../atomos";
import { alcanceDe, EFECTOS_FONDO, FONDO_SHADER, OPCIONES_RENDER_SHADER, planFondo, propsDeEfecto } from "../atomos/fondo-shader";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { FORMATO_SET, LICENCIA_SHADERS } from "@/lib/appearance/sets-fondo";

describe("átomo fondo-shader · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de shaders, se registra y está en el índice", () => {
    expect(FONDO_SHADER).toMatchObject({
      herramientaId: "shaders", categoria: "imagen", integracion: "libreria-js",
      control: "total", ficha: { licencia: "MIT" },
    });
    expect(FONDO_SHADER.parametros.map((p) => p.id)).toEqual(["efecto", "props", "capas", "difusion", "alcance"]);
    expect(FONDO_SHADER.salidas).toContain("starseed-fondo");
    expect(registrarAtomo(FONDO_SHADER)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(FONDO_SHADER);
    expect(OPCIONES_RENDER_SHADER.disableTelemetry).toBe(true);
  });

  it("el módulo es puro y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "fondo-shader.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
  });
});

describe("planFondo · plan puro del set", () => {
  const base = { id: "fondo-1", autor: "Alex", creado: "2026-10-28T10:00:00Z" };

  it("por defecto: Aurora, dos capas shader, motor base actual y licencia MIT", () => {
    const set = planFondo(base);
    expect(set).toMatchObject({
      formato: FORMATO_SET, version: 1, id: "fondo-1", nombre: "Aurora", autor: "Alex",
      base: null, licencias: [LICENCIA_SHADERS], creado: "2026-10-28T10:00:00.000Z",
    });
    expect(set.capas).toHaveLength(2);
    expect(set.capas[0]).toMatchObject({ kind: "shader", opacity: 1, blend: "normal" });
    expect(set.capas[0].preset?.components[0]).toMatchObject({ type: "Aurora", props: { intensity: 80 } });
    expect(set.capas[1]).toMatchObject({ kind: "shader", opacity: 0.35, blend: "screen" });
  });

  it("es puro: misma entrada, mismo set y no muta la entrada", () => {
    const entrada = {
      ...base, valores: { efecto: "cristal", props: 150, capas: 3, difusion: "desenfoque" },
      props: { refraction: 1.5, tintColor: "#123456" },
    };
    const copia = structuredClone(entrada);
    expect(planFondo(entrada)).toEqual(planFondo(entrada));
    expect(entrada).toEqual(copia);
  });

  it("elige el efecto y acota las capas a 1..8", () => {
    expect(planFondo({ ...base, valores: { efecto: "cromo" } }).capas[0].preset?.components[0].type).toBe("Chrome");
    expect(planFondo({ ...base, valores: { capas: 0 } }).capas).toHaveLength(1);
    expect(planFondo({ ...base, valores: { capas: 99 } }).capas).toHaveLength(8);
  });

  it("escala los props del catálogo y solo acepta claves declaradas", () => {
    expect(propsDeEfecto("aurora", 2)).toMatchObject({ intensity: 100, speed: 10, curtainCount: 4 });
    expect(propsDeEfecto("aurora", 1, { intensity: 20, colorA: "#123456", url: "https://shaders.com/x.jpg" }))
      .toMatchObject({ intensity: 20, colorA: "#123456" });
    expect(propsDeEfecto("aurora", 1, { url: "https://shaders.com/x.jpg" })).not.toHaveProperty("url");
  });

  it("añade la difusión pedida con su tono del catálogo", () => {
    const desenfoque = planFondo({ ...base, valores: { difusion: "desenfoque" } });
    expect(desenfoque.capas.at(-1)).toMatchObject({ kind: "difusion", difusion: { modo: "desenfoque", desenfoquePx: 24 } });
    const tono = planFondo({ ...base, valores: { difusion: "tono" } });
    expect(tono.capas.at(-1)?.difusion).toMatchObject({ modo: "tono", tono: "#a533f8" });
    expect(planFondo(base).capas.some((c) => c.kind === "difusion")).toBe(false);
  });

  it("ningún efecto usa cámara ni recursos de shaders.com", () => {
    for (const efecto of Object.keys(EFECTOS_FONDO)) {
      const json = JSON.stringify(planFondo({ ...base, valores: { efecto } }));
      expect(json).not.toMatch(/WebcamTexture|ObjectTracker|shaders\.com|https?:\/\//);
    }
  });

  it("sanea id y fecha inyectados sin leer el reloj", () => {
    expect(planFondo({ ...base, id: "no vale!", creado: "ayer", nombre: "Mi fondo" }))
      .toMatchObject({ id: "fondo-shaders", nombre: "Mi fondo", creado: "1970-01-01T00:00:00.000Z" });
  });

  it("resuelve el alcance con herencia y cae a perfil", () => {
    expect(alcanceDe()).toBe("perfil");
    for (const a of ["perfil", "app", "pagina", "seccion"]) expect(alcanceDe({ alcance: a })).toBe(a);
    expect(alcanceDe({ alcance: "mundo" })).toBe("perfil");
  });
});
