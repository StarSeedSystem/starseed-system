import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { construirCatalogo } from "@/lib/appearance/catalogo-shaders";
import { LICENCIA_SHADERS, type OpcionesSet } from "@/lib/appearance/sets-fondo";
import {
  ATRIBUCION_SHADERS, HABILIDAD_SHADERS, MAX_PALABRAS_RESUMEN, MAX_PALABRAS_TARJETA,
  comoCapacidad, contarPalabras, candidatosJson, extraerJson, presetDesdeRespuesta,
} from "../shaders";

const RAIZ = process.cwd();
const leer = (ruta: string): string => readFileSync(resolve(RAIZ, ruta), "utf8");


// Catálogo en miniatura con la MISMA forma que da `shaders/registry` (sin GPU ni red).
const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Gradients", propsMetadata: { colorA: { default: "#000000" } } },
  { name: "MeshGradient", category: "Gradients" },
  { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "WebcamTexture", category: "Textures" },
]);
const o: OpcionesSet = { catalogo, biblioteca: ["https://proyecto.supabase.co/storage/v1/object/public/os-files/"] };
const PRESET = JSON.stringify({ components: [{ type: "LinearGradient", id: "g", props: { colorA: "#7C3AED" } }] }, null, 0);

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;

  it("respeta los límites de palabras del encargo (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta), resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it("dice cuándo aplica en una sola frase", () => {
    expect(h.cuando.startsWith("Cuando ") && h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it("apunta al SKILL.md de la copia vendor (id «shaders») y tiene su components.md al lado", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    expect(/^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta))?.[1]).toBe(h.id);
    const componentes = leer("vendor/habilidades/shaders/components.md");
    for (const tipo of ["LinearGradient", "MeshGradient", "CursorTrail", "WebcamTexture", "Group"])
      expect(componentes, tipo).toContain(tipo);
  });

  it("cita la licencia MIT del original y está junto a la copia", () => {
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shaders");
    expect(leer("vendor/habilidades/shaders/LICENSE")).toContain("MIT License");
    expect(ATRIBUCION_SHADERS.includes("MIT") && ATRIBUCION_SHADERS.includes("shader-effects-inc")).toBe(true);
  });

  it("ningún texto lleva rutas absolutas ni direcciones, y el fondo actual manda", () => {
    for (const t of [h.cuando, h.resumen]) expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(h.tarjeta.includes("/Users/") && h.tarjeta.includes("http")).toBe(false);
    expect(h.tarjeta).toMatch(/motor base/);
  });
});

describe("candidatosJson y extraerJson", () => {
  it("recoge vallas, el objeto de la prosa y el texto pelado", () => {
    expect(candidatosJson(`antes\n${PRESET}\ndespués`)).toHaveLength(2);
    expect(candidatosJson(`\`\`\`json\n${PRESET}\n\`\`\``)).toHaveLength(3);
    expect(extraerJson(`Mirá:\n${PRESET} — listo`)?.components).toHaveLength(1);
    expect(extraerJson(PRESET)?.components).toHaveLength(1);
    expect(extraerJson("sin json por aquí...")).toBeUndefined();
    expect(extraerJson("[1, 2, 3]")).toBeUndefined();
  });
});

describe("presetDesdeRespuesta", () => {
  const motivos = (r: ReturnType<typeof presetDesdeRespuesta>): string =>
    r.ok ? "" : r.motivos.join(" | ");

  it("envuelve el preset de un modelo en un set listo para la Biblioteca", () => {
    const r = presetDesdeRespuesta(`Aquí tienes tu fondo:\n${PRESET}`, { ...o, crearId: () => "f1", ahora: () => new Date("2026-10-23T10:00:00Z") });
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.archivo).toMatch(/\.starseed-fondo\.json$/);
    expect(r.set).toMatchObject({ id: "f1", base: null, nombre: "Fondo descrito con Shaders", autor: "Astraura · Shaders", creado: "2026-10-23T10:00:00.000Z" });
    expect(r.set.capas[0].kind).toBe("shader");
    expect(r.set.capas[0].preset?.components).toEqual([{ type: "LinearGradient", id: "g", props: { colorA: "#7C3AED" } }]);
    expect(r.set.licencias).toContain(LICENCIA_SHADERS);
  });

  it("acepta el set COMPLETO que un modelo devuelva, con su nombre, id y base tal cual", () => {
    const set = { formato: "starseed-fondo", version: 1, id: "propio", nombre: "Ocaso", base: null,
      capas: [{ kind: "shader", preset: { components: [{ type: "MeshGradient" }] } }], autor: "Laya", licencias: [], creado: "2026-10-23T10:00:00.000Z" };
    const r = presetDesdeRespuesta(`\`\`\`json\n${JSON.stringify(set)}\n\`\`\``, o);
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.set).toMatchObject({ id: "propio", nombre: "Ocaso", base: null });
  });

  it("rechaza tipos que no estén en el catálogo, cámara y la muestra de shaders.com", () => {
    for (const tipo of ["Inventado", "WebcamTexture"])
      expect(motivos(presetDesdeRespuesta(JSON.stringify({ components: [{ type: tipo }] }), o)), tipo).toMatch(new RegExp(`«${tipo}» (desconocido|usa la cámara)`));
    expect(motivos(presetDesdeRespuesta(JSON.stringify({ components: [{ type: "ImageTexture", props: {} }] }), o))).toMatch(/shaders\.com/);
  });

  it("URL de la Biblioteca pasa y una ajena no", () => {
    const prueba = (url: string) => motivos(presetDesdeRespuesta(JSON.stringify({ components: [{ type: "ImageTexture", props: { url } }] }), o));
    expect(prueba("https://proyecto.supabase.co/storage/v1/object/public/os-files/u/f.png") === "").toBe(true);
    expect(prueba("https://malo.example/x.png")).toMatch(/URL fuera de la Biblioteca/);
  });

  it("sin JSON útil, vacío o lista pelada: motivos, nunca una excepción", () => {
    for (const t of ["no sé qué me pides", "", "[1, 2]"]) expect(motivos(presetDesdeRespuesta(t, o)), t || "(vacío)").toMatch(/no lleva JSON/);
    expect(motivos(presetDesdeRespuesta(JSON.stringify({ type: "Circle" }), o))).toMatch(/se esperaba «starseed-fondo»/);
  });

  it("la cámara se permite solo si quien llama la admite (compartido: false)", () => {
    expect(presetDesdeRespuesta(JSON.stringify({ components: [{ type: "WebcamTexture" }] }), { ...o, compartido: false }).ok).toBe(true);
  });
});
