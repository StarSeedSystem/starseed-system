import { describe, it, expect } from "vitest";
import {
  habilidadesPara,
  aptaParaRol,
  encajaConDirector,
  esDirector,
  normalizarEtiqueta,
  recortarPorCapa,
  CapaModelo,
} from "../habilidades-agente";
import type { SkillCapability } from "@/ai/astraura/skills";

/** Fabrica una SkillCapability de prueba con su system prompt corto. */
function cap(id: string, label: string, routing?: SkillCapability["routing"]): SkillCapability {
  return { id, label, systemPrompt: "Conocimiento de la habilidad.", ...(routing ? { routing } : {}) };
}

const CAPACIDADES: SkillCapability[] = [
  cap("av-gen", "Generación audiovisual (imagen · audio · vídeo)"),
  cap("taste", "Taste · calidad de UI y estética", { preferStrong: true }),
  cap("pm", "PM · producto y proyecto", { preferStrong: true, planning: true }),
  cap("vision", "Visión", { vision: true }),
  cap("router-proxy", "Enrutado y proxy de modelos (LiteLLM)", { planning: true }),
  cap("memoria-agente", "Memoria agéntica (Raven · Skales)", { preferStrong: true }),
];

const OPCIONES = { capacidades: CAPACIDADES, desactivadas: [] };

function ids(resultado: SkillCapability[]): string[] {
  return resultado.map((h) => h.id);
}

describe("habilidadesPara · por papel", () => {
  it("la habilidad neutra sale para cualquier papel", () => {
    const escritor = ids(habilidadesPara("escritor", "cuenta", OPCIONES));
    expect(escritor).toContain("av-gen");
    expect(esDirector("escritor")).toBe(false);
  });

  it("escritor recibe planning, web y preferStrong; no las de visión sola", () => {
    const escritor = ids(habilidadesPara("escritor", "cuenta", OPCIONES));
    expect(escritor).toEqual(expect.arrayContaining(["taste", "pm", "router-proxy"]));
    expect(escritor).not.toContain("vision");
  });

  it("visión recibe las que ven y las fuertes generalistas", () => {
    const vision = ids(habilidadesPara("visión", "cuenta", OPCIONES));
    expect(vision).toEqual(expect.arrayContaining(["vision", "taste", "pm"]));
    expect(vision).not.toContain("router-proxy");
  });

  it("voz e imagen solo reciben las neutras; imagen añade lo que ve", () => {
    expect(ids(habilidadesPara("voz", "cuenta", OPCIONES))).toEqual(["av-gen"]);
    expect(ids(habilidadesPara("imagen", "cuenta", OPCIONES))).toEqual(["av-gen", "vision"]);
  });

  it("la habilidad con routing vacío o con todos los flags apagados es neutra en cualquier papel", () => {
    const neutras: SkillCapability[] = [
      { id: "vacia", label: "Vacía", systemPrompt: "x", routing: {} },
      {
        id: "apagada",
        label: "Apagada",
        systemPrompt: "x",
        routing: { preferStrong: false, planning: false, web: false, vision: false },
      },
    ];
    for (const rol of ["escritor", "revisor", "visión", "código", "voz", "imagen"] as const) {
      expect(ids(habilidadesPara(rol, "cuenta", { capacidades: neutras, desactivadas: [] })), rol).toEqual([
        "vacia",
        "apagada",
      ]);
    }
  });

  it("excluir las habilidades desactivadas en el ámbito", () => {
    const out = ids(
      habilidadesPara("escritor", "cuenta", {
        capacidades: CAPACIDADES,
        desactivadas: ["taste", "pm", "router-proxy", "memoria-agente"],
      }),
    );
    expect(out).toEqual(["av-gen"]);
  });
});

describe("habilidadesPara · por director (etiquetas)", () => {
  it("diseño elige por etiquetas: taste y clonador de diseño", () => {
    const conEjemplo = [...CAPACIDADES, cap("design-import", "Importar diseño (clonador de webs)", { preferStrong: true })];
    const out = ids(habilidadesPara("diseno", "cuenta", { capacidades: conEjemplo, desactivadas: [] }));
    expect(out).toEqual(["taste", "design-import"]);
    expect(esDirector("diseno")).toBe(true);
  });

  it("producción elige lo audiovisual y de voz; aprendizaje, lo de memoria", () => {
    expect(ids(habilidadesPara("produccion", "cuenta", OPCIONES))).toEqual(["av-gen"]);
    expect(ids(habilidadesPara("aprendizaje", "cuenta", OPCIONES))).toEqual(["memoria-agente"]);
    expect(esDirector("aprendizaje")).toBe(true);
  });

  it("el director chat aprovecha todas las habilidades", () => {
    const out = ids(habilidadesPara("chat", "cuenta", OPCIONES));
    expect(out).toHaveLength(CAPACIDADES.length);
  });

  it("las etiquetas comparan sin acentos y por nombre o id", () => {
    expect(normalizarEtiqueta("Diseño de Pízarra")).toBe("diseno de pizarra");
    const maestro: SkillCapability = cap("med", "Telemetría y coste (medidor)");
    expect(encajaConDirector(maestro, "medidores")).toBe(true);
    expect(encajaConDirector(CAPACIDADES[0], "medidores")).toBe(false);
  });
});

describe("capa del modelo: tamaño de cada habilidad", () => {
  const largo = Array.from({ length: 400 }, (_, i) => `palabra${i % 97}`).join(" ");
  const larga: SkillCapability[] = [cap("largo", "Larga", { preferStrong: true })];
  larga[0].systemPrompt = largo;

  const contar = (capa: CapaModelo): number =>
    habilidadesPara("escritor", "cuenta", { capacidades: larga, desactivadas: [] }, capa)[0].systemPrompt
      .split(/\s+/).length;

  it("tarjeta ≤ 60 palabras y resumen ≤ 250 (laya-y-habilidades §5)", () => {
    expect(recortarPorCapa(largo, "tarjeta").split(/\s+/)).toHaveLength(60);
    expect(contar("tarjeta")).toBe(60);
    expect(contar("resumen")).toBe(250);
  });

  it("completa conserva el texto íntegro; el recorte corta por palabra", () => {
    expect(recortarPorCapa(largo, "completa")).toBe(largo);
    expect(recortarPorCapa("hola mundo", "tarjeta")).toBe("hola mundo");
    expect(recortarPorCapa("", "tarjeta")).toBe("");
  });

  it("aptaParaRol coincide con la selección de habilidadesPara", () => {
    const seleccion = CAPACIDADES.filter((h) => aptaParaRol(h, "código"));
    expect(ids(seleccion).sort()).toEqual(ids(habilidadesPara("código", "cuenta", OPCIONES)).sort());
  });
});
