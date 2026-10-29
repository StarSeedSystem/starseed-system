import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { construirCatalogo, type ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import {
  ATRIBUCION_SHADERS, HABILIDAD_SHADERS, MAX_PALABRAS_RESUMEN, MAX_PALABRAS_TARJETA,
  contarPalabras, comoCapacidad, extraerJson, presetDesdeRespuesta,
} from "../shaders";
// Las rutas del encargo son relativas a la raíz del repositorio; el alias RAIZ lo dice.
const RAIZ = process.cwd(), leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

/** Catálogo sintético (como el que `construirCatalogo` arma desde `shaders/registry`). */
const catalogo: ShaderCatalog = construirCatalogo([
  { name: "MeshGradient", category: "Texturas", description: "Degradado de malla", propsMetadata: {} },
  { name: "SimplexNoise", category: "Texturas", description: "Ruido simplex", propsMetadata: {} },
  { name: "ImageTexture", category: "Texturas", description: "Una imagen", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "Blur", category: "Blurs", description: "Desenfoque", propsMetadata: {} },
  { name: "WebcamTexture", category: "Texturas", description: "La cámara", propsMetadata: {} },
]);

const opciones = { catalogo, ahora: () => new Date("2026-10-29T10:00:00Z") };
const desdeRespuesta = (t: string, mas?: object) => presetDesdeRespuesta(t, { ...opciones, ...mas });
const respuestaBuena =
  "```json\n{\"components\":[{\"type\":\"MeshGradient\",\"props\":{\"colorA\":\"#1a0533\"}},{\"type\":\"SimplexNoise\",\"props\":{\"opacity\":0.12}}],\"structureVersion\":1}\n```";

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;
  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60); expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta), resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30); expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN); expect(resumen).toBeGreaterThan(tarjeta);
  });

  it("apunta al SKILL.md de la copia vendor, con la licencia MIT del original", () => {
    expect(h.licencia).toBe("MIT"); expect(h.autor).toBe("Shader Effects Inc.");
    expect(ATRIBUCION_SHADERS).toContain("MIT"); expect(ATRIBUCION_SHADERS).toContain("shader-effects-inc/shaders");
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
  });

  it("textos sanos: una frase de cuándo, sin rutas absolutas ni URLs, honestidad con límites", () => {
    expect(h.cuando.startsWith("Cuando ") && h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
    for (const t of [h.cuando, h.tarjeta, h.resumen]) expect(t).not.toMatch(/\/Users\/|\/home\/|\bhttps?:\/\/[^\s]+/);
    for (const t of [h.tarjeta, h.resumen]) {
      expect(t).toContain("disableTelemetry"); expect(t).toMatch(/shaders\.com/); expect(t).toMatch(/principal/);
    } // telemetría apagada · nada de shaders.com · el motor del OS sigue siendo lo principal
  });
});

describe("extraerJson", () => {
  it("lee el JSON de la respuesta: cercado primero, luego el objeto suelto", () => {
    expect(extraerJson("Vale:\n```json\n{\"components\":[{\"type\":\"Blur\"}]}\n```")).toEqual({ components: [{ type: "Blur" }] });
    expect(extraerJson("Nota {a?}:\n```json\n{\"components\":[]}\n```\n{mal}")).toEqual({ components: [] });
    expect(extraerJson("{\"components\":[]}")).toEqual({ components: [] });
    expect(extraerJson("antes {\"components\":[]} después")).toEqual({ components: [] });
    expect(extraerJson("no hay nada")).toBeUndefined();
  });
});

describe("presetDesdeRespuesta", () => {
  it("convierte la respuesta en una capa shader validada con su licencia MIT", () => {
    const r = desdeRespuesta(respuestaBuena);
    if (!r.ok) throw new Error(JSON.stringify(r.motivos));
    expect(r.capa.kind).toBe("shader"); expect(r.capa.name).toBe("Fondo descrito por Astraura");
    expect(r.capa.preset).toEqual({ structureVersion: 1, components: [
      { type: "MeshGradient", props: { colorA: "#1a0533" } }, { type: "SimplexNoise", props: { opacity: 0.12 } }] });
    expect(r.set.base).toBeNull(); // el motor actual (Spline) sigue siendo la opción principal
    expect(r.set.licencias.join(" ")).toContain("MIT"); expect(r.set.id).toMatch(/^[\w-]{1,64}$/);
  });

  it("admite el preset dentro de una caja y el set .starseed-fondo.json completo", () => {
    expect(desdeRespuesta("{\"preset\":{\"components\":[{\"type\":\"Blur\"}]}}").ok).toBe(true);
    const set = { formato: "starseed-fondo", version: 1, id: "set-1", nombre: "Aurora propia", autor: "Persona",
      licencias: [], base: null, creado: "2026-10-29T09:00:00Z",
      capas: [{ id: "a", kind: "shader", visible: true, opacity: 1, blend: "normal", preset: { components: [{ type: "MeshGradient", props: {} }] } }] };
    const completo = desdeRespuesta(JSON.stringify(set));
    if (!completo.ok) throw new Error(JSON.stringify(completo.motivos));
    expect(completo.set.nombre).toBe("Aurora propia"); expect(completo.set.autor).toBe("Persona");
  });

  it("rechaza sin ambigüedad: sin JSON, sin componentes o sin capas", () => {
    expect(desdeRespuesta("lo siento, no puedo")).toEqual({
      ok: false, motivos: ["el modelo no devolvió un objeto JSON legible"] });
    expect(desdeRespuesta("{\"components\":[], \"notes\":\"x\"}")).toEqual({
      ok: false, motivos: ["el preset no trae componentes: falta «components» o está vacío"] });
    const sinCapas = { formato: "starseed-fondo", version: 1, id: "x1", nombre: "V", autor: "a", licencias: [], base: null, creado: "2026-10-29T09:00:00Z", capas: [] };
    const r = desdeRespuesta(JSON.stringify(sinCapas));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivos.join(" ")).toMatch("no trae capas");
  });

  it("rechaza tipos ajenos al catálogo y la muestra por defecto de shaders.com", () => {
    const r = desdeRespuesta("{\"components\":[{\"type\":\"PlasmaNebulaPro\"}]}");
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivos.join(" ")).toMatch("desconocido");
    const muestra = desdeRespuesta("{\"components\":[{\"type\":\"ImageTexture\"}]}");
    expect(muestra.ok).toBe(false); if (!muestra.ok) expect(muestra.motivos.join(" ")).toMatch("sin «url» propio");
  });

  it("cámara: solo con permiso explícito y nunca en un set compartido", () => {
    const r = desdeRespuesta("{\"components\":[{\"type\":\"WebcamTexture\"}]}");
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivos.join(" ")).toMatch("cámara");
    expect(desdeRespuesta("{\"components\":[{\"type\":\"WebcamTexture\"}]}", { permisoCamara: true }).ok).toBe(true);
    const compartido = desdeRespuesta("{\"components\":[{\"type\":\"ObjectTracker\"}]}", { permisoCamara: true, compartido: true });
    expect(compartido.ok).toBe(false); if (!compartido.ok) expect(compartido.motivos.join(" ")).toMatch("compartido");
  });
});

describe("comoCapacidad", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidad(HABILIDAD_SHADERS, "tarjeta");
    expect(tarjeta).toEqual({ id: "shaders", label: HABILIDAD_SHADERS.nombre,
      systemPrompt: `${HABILIDAD_SHADERS.tarjeta} (Shader Effects Inc., MIT)` });
    const resumen = comoCapacidad(HABILIDAD_SHADERS, "resumen");
    expect(resumen.systemPrompt.startsWith(`${HABILIDAD_SHADERS.resumen} (Shader Effects Inc., MIT)`)).toBe(true);
  });
});
