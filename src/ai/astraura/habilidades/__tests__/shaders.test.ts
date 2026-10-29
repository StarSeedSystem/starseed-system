import { describe, it, expect } from "vitest";
import { LICENCIA_SHADERS, type SetFondo } from "@/lib/appearance/sets-fondo";
import { construirCatalogo } from "@/lib/appearance/catalogo-shaders";
import {
  HABILIDAD_SHADERS,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidad,
  extraerJsonPreset,
  presetDesdeRespuesta,
} from "../shaders";

const CATALOGO = construirCatalogo(
  ["MeshGradient", "SimplexNoise", "Blur", "Vignette", "CursorTrail", "WebcamTexture"].map((name) => ({ name, category: "Textures" })),
);

const PRESET = { nombre: "Aurora púrpura", components: [
  { type: "MeshGradient", props: { colorA: "#1a0533", colorB: "#ffdf8e" } },
  { type: "Blur", props: { intensity: 12 } },
] };
const RESPUESTA_OK = `Te propongo un fondo cálido:\n\n\`\`\`json\n${JSON.stringify(PRESET)}\n\`\`\`\n\nSi lo quieres más frío, lo retoco describiéndolo.`;
const FENCED = (adentro: string) => `\`\`\`json\n${adentro}\n\`\`\``;

type Opc = Parameters<typeof presetDesdeRespuesta>[1];
type Respuesta = ReturnType<typeof presetDesdeRespuesta>;
const opciones = (extra?: Partial<Opc>): Opc => ({ catalogo: CATALOGO, ...extra }) as Opc;
/** Devuelve el set validado, con su «ok: true» comprobado de verdad (estrena el estrechado de la unión). */
const setDe = (texto: string, extra?: Partial<Opc>): SetFondo => {
  const r: Respuesta = presetDesdeRespuesta(texto, opciones(extra));
  const motivos = r.ok ? "" : r.motivos.join(" | ");
  expect(r.ok, `motivos: ${motivos}`).toBe(true);
  if (!r.ok) throw new Error(r.motivos.join());
  return r.set;
};
/** Devuelve los motivos del rechazo, con su «ok: false» comprobado de verdad. */
const motivosDe = (texto: string, extra?: Partial<Opc>): string[] => {
  const r: Respuesta = presetDesdeRespuesta(texto, opciones(extra));
  if (r.ok) throw new Error("se esperaba el rechazo del preset");
  return r.motivos;
};

const contar = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

describe("extraerJsonPreset", () => {
  it("saca el preset (cercado o suelto), respeta llaves en cadenas y da undefined sin JSON", () => {
    const deCercado = extraerJsonPreset(RESPUESTA_OK) as Record<string, unknown>;
    const suelto = extraerJsonPreset('Esto: {"components":[]} — dime qué te parece.') as Record<string, unknown>;
    const conLlaves = extraerJsonPreset('{"components":[{"type":"Text","props":{"text":"a { y } b"}}]} y ya.') as Record<string, unknown>;
    expect(Array.isArray(deCercado.components)).toBe(true);
    expect(Array.isArray(suelto.components)).toBe(true);
    expect((conLlaves.components as unknown[]).length).toBe(1);
    expect(extraerJsonPreset("No llevo ningún JSON, lo siento por el modelo.) ")).toBeUndefined();
  });
});

describe("HABILIDAD_SHADERS", () => {
  const h = HABILIDAD_SHADERS;

  it("responde a los límites del encargo: ≤ 60/120 palabras, MIT, vendor y sin URLs", () => {
    expect(contar(h.tarjeta)).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(contar(h.resumen)).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
    expect(h.rutaCompleta).toBe("vendor/habilidades/shaders/SKILL.md");
    expect(h.rutaCompleta.startsWith("/")).toBe(false);
    expect(h.licencia).toBe("MIT");
    for (const t of [h.cuando, h.tarjeta, h.resumen]) expect(t).not.toMatch(/https?:\/\/|\/Users\/|\/home\//);
  });
});

describe("presetDesdeRespuesta", () => {
  const CERO = '{"components":[{"type":"MeshGradient","props":{}}]}';

  it("vuelve un preset válido como set: capa shader, licencia MIT, motor base nulo y nombre", () => {
    const set = setDe(RESPUESTA_OK);
    expect(set.formato).toBe("starseed-fondo");
    expect(set.capas).toHaveLength(1);
    expect(set.capas[0].kind).toBe("shader");
    expect(set.capas[0].preset?.components).toHaveLength(2);
    expect(set.licencias).toContain(LICENCIA_SHADERS);
    expect(set.base).toBe(null); // el motor base actual sigue siendo el principal
    expect(set.nombre).toBe("Aurora púrpura");
    expect(setDe(RESPUESTA_OK, { nombre: "Fondo de la neurona" }).nombre).toBe("Aurora púrpura");
    expect(setDe(FENCED(CERO), { nombre: "Liso" }).nombre).toBe("Liso");
  });

  it("rechaza tipos que no existen en el catálogo, también anidados en children", () => {
    expect(motivosDe(FENCED('{"components":[{"type":"NubeMagica","props":{}}]}')).some((m) => m.includes("desconocido"))).toBe(true);
    expect(motivosDe(FENCED('{"components":[{"type":"Blur","children":[{"type":"Inexistente","props":{}}]}]}')).some((m) => m.includes("Inexistente"))).toBe(true);
  });

  it("rechaza la cámara sin permiso explícito y en sets compartidos siempre", () => {
    const texto = FENCED('{"components":[{"type":"WebcamTexture","props":{}}]}');
    expect(motivosDe(texto).some((m) => m.toLowerCase().includes("cámara"))).toBe(true);
    expect(presetDesdeRespuesta(texto, opciones({ permisoCamara: true })).ok).toBe(true);
    expect(presetDesdeRespuesta(texto, opciones({ permisoCamara: true, compartido: true })).ok).toBe(false);
  });

  it("rechaza una respuesta sin JSON, sin «components» o con JSON roto", () => {
    expect(motivosDe("Hoy mejor lo hablamos con palabras, sin datos.")[0]).toContain("no trae un JSON");
    expect(motivosDe(FENCED('{"props":{}}'))[0]).toContain("components");
    expect(presetDesdeRespuesta(FENCED('{"components":[{"type":"MeshGradient",}'), opciones()).ok).toBe(false);
  });

  it("acepta un set «.starseed-fondo.json» ya completo venga en la respuesta", () => {
    const set = setDe(RESPUESTA_OK);
    expect(setDe(FENCED(JSON.stringify({ ...set, capas: set.capas })), { permisoCamara: true }).capas[0].kind).toBe("shader");
  });
});

describe("comoCapacidad", () => {
  it("adapta la habilidad al registro con el tamaño pedido", () => {
    expect(comoCapacidad(HABILIDAD_SHADERS, "tarjeta")).toEqual({
      id: "shaders",
      label: HABILIDAD_SHADERS.nombre,
      systemPrompt: `${HABILIDAD_SHADERS.tarjeta} (${HABILIDAD_SHADERS.autor}, MIT)`,
    });
    expect(comoCapacidad(HABILIDAD_SHADERS, "resumen").systemPrompt.startsWith(HABILIDAD_SHADERS.resumen)).toBe(true);
  });
});
