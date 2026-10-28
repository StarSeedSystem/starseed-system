import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { construirCatalogo } from "@/lib/appearance/catalogo-shaders";
import {
  ATRIBUCION_SHADERS,
  HABILIDAD_SHADERS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  contarPalabras,
  presetDesdeRespuesta,
  type OpcionesPreset,
} from "../shaders";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");
const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Texturas" },
  { name: "SimplexNoise", category: "Texturas" },
  { name: "Group", category: "Utilidades" },
  { name: "ImageTexture", category: "Texturas", propsMetadata: { url: { default: "https://shaders.com/muestra.jpg" } } },
  { name: "WebcamTexture", category: "Texturas" },
  { name: "ObjectTracker", category: "Estilizar" },
]);
const o: OpcionesPreset = { catalogo };
const PRESET = {
  components: [
    { type: "LinearGradient", id: "fondo", props: { colorA: "#1a0533", colorB: "#ffdf8e" } },
    { type: "SimplexNoise", props: { opacity: 0.12 } },
  ],
  structureVersion: 2,
};
const respuesta = (p: unknown) => `Claro, aquí tienes el fondo:\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\nDime si lo cambio.`;
const motivos = (r: ReturnType<typeof presetDesdeRespuesta>) => (r.ok ? "" : r.motivos.join(" | "));

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;

  it("respeta los límites de palabras (60 y 120) y dice cuándo aplica", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    expect(tarjeta).toBeGreaterThan(20);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(contarPalabras(h.resumen)).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(contarPalabras(h.resumen)).toBeGreaterThan(tarjeta);
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it("apunta al SKILL.md vendor, que es el suyo, y cita la licencia MIT", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    expect(/^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta))?.[1]).toBe(h.id);
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shader Effects Inc.");
    expect(leer("vendor/habilidades/shaders/LICENSE")).toContain("Shader Effects Inc.");
    expect(ATRIBUCION_SHADERS).toContain("MIT");
  });

  it("cuenta palabras por espacios, también símbolos", () => {
    expect(contarPalabras("  uno  dos\ntres ")).toBe(3);
    expect(contarPalabras("")).toBe(0);
    expect(contarPalabras("rojo → verde")).toBe(3);
  });
});

describe("presetDesdeRespuesta", () => {
  it("extrae el preset de un bloque de código con prosa alrededor", () => {
    const r = presetDesdeRespuesta(respuesta(PRESET), o);
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.preset).toEqual(PRESET);
  });

  it("acepta la forma corta de lista y un JSON suelto entre texto", () => {
    const corto = presetDesdeRespuesta('Toma: [{"type":"LinearGradient"}] y ya está', o);
    if (!corto.ok) throw new Error(corto.motivos.join());
    expect(corto.preset.components).toEqual([{ type: "LinearGradient", props: {} }]);
    expect(presetDesdeRespuesta(`antes {"components":[{"type":"SimplexNoise"}]} después`, o).ok).toBe(true);
  });

  it("rechaza tipos que no existen en el catálogo instalado", () => {
    expect(motivos(presetDesdeRespuesta(respuesta({ components: [{ type: "MagiaInfinita" }] }), o))).toMatch(/«MagiaInfinita» desconocido/);
    expect(motivos(presetDesdeRespuesta(respuesta({ components: [{ props: {} }] }), o))).toMatch(/sin tipo/);
  });
});

describe("presetDesdeRespuesta · guardas del contrato", () => {
  it("la cámara no entra nunca, ni escondida dentro de un grupo", () => {
    expect(motivos(presetDesdeRespuesta(respuesta({ components: [{ type: "WebcamTexture" }] }), o))).toMatch(/cámara/);
    const anidada = { components: [{ type: "Group", children: [{ type: "ObjectTracker" }] }] };
    expect(motivos(presetDesdeRespuesta(respuesta(anidada), o))).toMatch(/cámara/);
  });

  it("rechaza texturas sin url propia y URLs fuera de la Biblioteca", () => {
    expect(motivos(presetDesdeRespuesta(respuesta({ components: [{ type: "ImageTexture" }] }), o))).toMatch(/shaders\.com/);
    const ajena = { components: [{ type: "ImageTexture", props: { url: "https://malo.example/a.png" } }] };
    expect(motivos(presetDesdeRespuesta(respuesta(ajena), o))).toMatch(/URL fuera de la Biblioteca/);
  });

  it("no muta la respuesta y descarta lo que no es del preset", () => {
    const original = { ...PRESET, nota: "fuera", components: [...PRESET.components] };
    const copia = JSON.parse(JSON.stringify(original));
    const r = presetDesdeRespuesta(respuesta(original), o);
    if (!r.ok) throw new Error(r.motivos.join());
    expect(original).toEqual(copia);
    expect(r.preset).not.toHaveProperty("nota");
    expect(r.preset.structureVersion).toBe(2);
  });

  it("sin JSON, roto, vacío o sin componentes: motivos claros", () => {
    expect(motivos(presetDesdeRespuesta("solo prosa", o))).toMatch(/no hay ningún JSON/);
    expect(motivos(presetDesdeRespuesta("```json\n{components: [}\n```", o))).toMatch(/no hay ningún JSON/);
    expect(motivos(presetDesdeRespuesta("   ", o))).toMatch(/vacía/);
    expect(motivos(presetDesdeRespuesta(respuesta({ hola: 1 }), o))).toMatch(/components/);
    expect(motivos(presetDesdeRespuesta(respuesta({ components: [] }), o))).toMatch(/no trae componentes/);
  });
});
