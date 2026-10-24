import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ATRIBUCION_SHADERS, HABILIDAD_SHADERS, MAX_PALABRAS_RESUMEN, MAX_PALABRAS_TARJETA,
  contarPalabras, comoCapacidad, presetDesdeRespuesta, type OpcionesRespuesta,
} from "../shaders";
import type { ShaderCatalog, ShaderCatalogEntry } from "@/lib/appearance/catalogo-shaders";

// Las rutas del encargo son relativas a la raíz del repositorio (donde corre vitest).
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

const entrada = (name: string, requiereCamara = false): ShaderCatalogEntry => ({
  name, category: "Prueba", description: `${name} de prueba`, requiereCamara,
  interactivo: false, necesitaHijo: false, pesado: false, props: {},
});
const CATALOGO: ShaderCatalog = {
  Prueba: [entrada("LinearGradient"), entrada("MeshGradient"), entrada("WebcamTexture", true)],
};
const OPCIONES = (): OpcionesRespuesta => ({ catalogo: CATALOGO });

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;

  it("cuenta palabras y respeta los límites del encargo (60 y 120)", () => {
    expect(contarPalabras("")).toBe(0);
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta), resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(resumen).toBeGreaterThan(tarjeta);
  });

  it("dice cuándo aplica en una sola frase y sus textos llevan solo lo pausible", () => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
    for (const t of [h.cuando, h.tarjeta, h.resumen])
      expect(t).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  it("apunta al SKILL.md de la copia vendor y cita la licencia MIT junto a ella", () => {
    expect(isAbsolute(h.rutaCompleta)).toBe(false);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(existsSync(resolve(RAIZ, h.rutaCompleta))).toBe(true);
    const nombre = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(leer(h.rutaCompleta));
    expect(nombre?.[1]).toBe(h.id);
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("Shader Effects Inc.");
    const licencia = leer("vendor/habilidades/shaders/LICENSE");
    expect(licencia).toContain("MIT License");
    expect(licencia).toContain("Shader Effects Inc.");
    expect(ATRIBUCION_SHADERS).toContain("MIT");
  });
});

describe("presetDesdeRespuesta", () => {
  const PRESET = "```json\n{ \"components\": [{ \"type\": \"LinearGradient\", \"props\": { \"colorA\": \"#0f172a\", \"colorB\": \"#7c3aed\" } }] }\n```";
  const CON_NOMBRE = "{\"nombre\": \"Aurora de malla\", \"components\": [{\"type\": \"MeshGradient\", \"props\": {}}]}";
  const CAMARA = "{ \"components\": [{ \"type\": \"WebcamTexture\", \"props\": {} }] }";

  it("extrae el JSON de la valla de una respuesta con prosa y arma el set", () => {
    const r = presetDesdeRespuesta(`Te propongo este fondo:\n${PRESET}\n¿te gusta?`, OPCIONES());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const capa = r.set.capas[0];
    expect(r.set.nombre).toBe("Fondo de Astraura");
    expect(r.set.autor).toBe("Astraura");
    expect(r.set.licencias).toContain("MIT");
    expect(capa.kind).toBe("shader");
  });

  it("sanéa las props y guarda el nombre que trae el preset del modelo", () => {
    const r = presetDesdeRespuesta(PRESET, OPCIONES());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set.capas[0].preset?.components).toEqual([
      { type: "LinearGradient", props: { colorA: "#0f172a", colorB: "#7c3aed" } },
    ]);
    const conNombre = presetDesdeRespuesta(CON_NOMBRE, OPCIONES());
    expect(conNombre.ok).toBe(true);
    if (conNombre.ok) expect(conNombre.set.nombre).toBe("Aurora de malla");
  });

  it.each([
    ["sin JSON", "", "no contiene un objeto JSON"],
    ["JSON roto", "{ \"components\": [{", "no contiene JSON válido"],
    ["ni preset ni set", "{ \"otra\": \"cosa\" }", "no es un preset ni un set de fondos"],
  ])("%s → rechaza con motivo", (_t, texto, motivo) => {
    const r = presetDesdeRespuesta(texto, OPCIONES());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivos.some((m) => m.includes(motivo))).toBe(true);
  });

  it("rechaza los tipos que no estén en el catálogo", () => {
    const r = presetDesdeRespuesta("{ \"components\": [{ \"type\": \"SombraMagica\" }] }", OPCIONES());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join("\n")).toContain("desconocido");
  });

  it("rechaza la cámara por defecto, y la admite solo con permiso explícito", () => {
    const denegado = presetDesdeRespuesta(CAMARA, OPCIONES());
    expect(denegado.ok).toBe(false);
    if (!denegado.ok) expect(denegado.motivos.join("\n")).toContain("cámara");
    const permitido = presetDesdeRespuesta(CAMARA, { ...OPCIONES(), compartido: false });
    expect(permitido.ok).toBe(true);
  });

  it("pasa un set completo por validarSet sin tocarlo", () => {
    const set = {
      formato: "starseed-fondo", version: 1, id: "set-prueba", nombre: "Set completo", autor: "Alex",
      licencias: [], base: "spline",
      capas: [{ id: "capa-1", kind: "shader", visible: true, opacity: 1,
        preset: { components: [{ type: "MeshGradient", props: {} }] } }],
      creado: "2026-10-24T00:00:00.000Z",
    };
    const r = presetDesdeRespuesta(`\`\`\`json\n${JSON.stringify(set)}\n\`\`\``, OPCIONES());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set.nombre).toBe("Set completo");
  });
});

describe("comoCapacidad", () => {
  it("adapta a la forma del registro con el tamaño pedido y la atribución", () => {
    const tarjeta = comoCapacidad(HABILIDAD_SHADERS, "tarjeta");
    expect(tarjeta).toEqual({
      id: "shaders",
      label: HABILIDAD_SHADERS.nombre,
      systemPrompt: `${HABILIDAD_SHADERS.tarjeta} (Shader Effects Inc., MIT)`,
    });
    const resumen = comoCapacidad(HABILIDAD_SHADERS, "resumen");
    expect(resumen.systemPrompt.endsWith("(Shader Effects Inc., MIT)")).toBe(true);
  });
});
