import { describe, expect, it } from "vitest";
import { construirCatalogo } from "@/lib/appearance/catalogo-shaders";
import {
  ATRIBUCION_SHADERS,
  HABILIDAD_SHADERS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidad,
  contarPalabras,
  presetDesdeRespuesta,
} from "../shaders";

// Catálogo de prueba con la MISMA forma que da `shaders/registry` (sin GPU, sin red).
const catalogo = construirCatalogo([
  { name: "MeshGradient", category: "Textures" },
  { name: "SimplexNoise", category: "Textures" },
  { name: "CursorTrail", category: "Interactive" },
  { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "WebcamTexture", category: "Textures" },
  { name: "ObjectTracker", category: "Stylize" },
]);
const BIB = "https://proyecto.supabase.co/storage/v1/object/public/os-files/";
const preset = (components: unknown[]) => JSON.stringify({ components, structureVersion: 1 });

describe("HABILIDAD_SHADERS", () => {
  it("tiene la forma de las tarjetas y respeta los límites de 60 y 120 palabras", () => {
    const h = HABILIDAD_SHADERS;
    expect(h.id).toBe("shaders");
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shader Effects Inc.");
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta), resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeGreaterThan(tarjeta);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
  });

  it("dice cuándo aplica en una sola frase y respeta las reglas del contrato", () => {
    expect(HABILIDAD_SHADERS.cuando.startsWith("Cuando ")).toBe(true);
    expect(HABILIDAD_SHADERS.cuando.endsWith(".")).toBe(true);
    expect(HABILIDAD_SHADERS.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
    for (const texto of [HABILIDAD_SHADERS.tarjeta, HABILIDAD_SHADERS.resumen]) {
      expect(texto).toMatch(/Spline/);
      expect(texto).toMatch(/WebGPU/);
      expect(texto).toMatch(/shaders\.com/);
      expect(texto).toMatch(/cámara|WebcamTexture/);
    }
    expect(HABILIDAD_SHADERS.resumen).toContain("disableTelemetry: true");
    expect(ATRIBUCION_SHADERS).toContain("MIT");
    expect(ATRIBUCION_SHADERS).toContain("shader-effects-inc");
  });

  it("comoCapacidad usa el tamaño pedido y la atribución", () => {
    expect(comoCapacidad(HABILIDAD_SHADERS, "tarjeta")).toEqual({
      id: "shaders",
      label: HABILIDAD_SHADERS.nombre,
      systemPrompt: `${HABILIDAD_SHADERS.tarjeta} (Shader Effects Inc., MIT)`,
    });
    expect(comoCapacidad().systemPrompt).toContain(HABILIDAD_SHADERS.resumen);
  });
});

describe("presetDesdeRespuesta", () => {
  it("extrae el JSON de un bloque cercado o del texto suelto", () => {
    const texto = `Claro:\n\`\`\`json\n${preset([{ type: "MeshGradient", props: { speed: 0.6 } }])}\n\`\`\`\nListo.`;
    const r = presetDesdeRespuesta(texto, { catalogo });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preset.components).toEqual([{ type: "MeshGradient", props: { speed: 0.6 } }]);
      expect(r.preset.structureVersion).toBe(1);
      expect(r.set.base).toBeNull();
      expect(r.set.capas[0]?.kind).toBe("shader");
    }
    expect(presetDesdeRespuesta(`Aquí: ${preset([{ type: "CursorTrail" }])}`, { catalogo }).ok).toBe(true);
    expect(presetDesdeRespuesta(preset([{ type: "MeshGradient" }])).ok).toBe(true); // catálogo de respaldo
  });

  it("acepta el preset envuelto o un set completo con capa shader", () => {
    expect(presetDesdeRespuesta(JSON.stringify({ preset: { components: [{ type: "SimplexNoise" }] } }), { catalogo }).ok).toBe(true);
    const set = { formato: "starseed-fondo", version: 1, id: "s", nombre: "S", autor: "A", licencias: [], base: null,
      creado: "2026-10-28T00:00:00.000Z",
      capas: [{ id: "c", kind: "shader", visible: true, opacity: 1, blend: "normal", preset: { components: [{ type: "MeshGradient" }] } }] };
    expect(presetDesdeRespuesta(JSON.stringify(set), { catalogo }).ok).toBe(true);
  });

  it("rechaza tipos fuera del catálogo, también anidados", () => {
    expect(presetDesdeRespuesta(preset([{ type: "Minador" }]), { catalogo })).toMatchObject({ ok: false });
    const r = presetDesdeRespuesta(preset([{ type: "MeshGradient", children: [{ type: "Inventado" }] }]), { catalogo });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toMatch(/Inventado.*desconocido/);
  });

  it("rechaza la cámara por defecto y en fondos compartidos; la admite solo con permiso privado", () => {
    for (const type of ["WebcamTexture", "ObjectTracker"]) {
      const r = presetDesdeRespuesta(preset([{ type }]), { catalogo });
      expect(r.ok, type).toBe(false);
      if (!r.ok) expect(r.motivos.join(" ")).toMatch(/cámara|permiso/);
      expect(presetDesdeRespuesta(preset([{ type }]), { catalogo, permitirCamara: true, compartido: true }).ok).toBe(false);
      expect(presetDesdeRespuesta(preset([{ type }]), { catalogo, permitirCamara: true, compartido: false }).ok).toBe(true);
    }
  });

  it("rechaza recursos de shaders.com y URLs fuera de la Biblioteca", () => {
    const sinUrl = presetDesdeRespuesta(preset([{ type: "ImageTexture" }]), { catalogo });
    expect(sinUrl.ok).toBe(false);
    if (!sinUrl.ok) expect(sinUrl.motivos.join(" ")).toMatch(/shaders\.com/);
    expect(presetDesdeRespuesta(preset([{ type: "ImageTexture", props: { url: "https://malo.example/x.png" } }]), { catalogo }).ok).toBe(false);
    expect(presetDesdeRespuesta(preset([{ type: "ImageTexture", props: { url: `${BIB}uid/fondo.png` } }]), { catalogo, biblioteca: [BIB] }).ok).toBe(true);
  });

  it("rechaza respuestas sin JSON o con JSON que no es un preset", () => {
    expect(presetDesdeRespuesta("No hay nada que pintar.", { catalogo }).ok).toBe(false);
    expect(presetDesdeRespuesta("```json\n{ roto: }\n```", { catalogo }).ok).toBe(false);
    expect(presetDesdeRespuesta(JSON.stringify({ hola: "mundo" }), { catalogo }).ok).toBe(false);
  });
});
