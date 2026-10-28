/**
 * Genesis · Habilidades de la Biblioteca para los agentes (Ola 1019G, tarea W).
 * Elige las SkillCapability de src/ai/astraura/skills.ts útiles a un papel de
 * agente (por `routing`) o a un director del ámbito (por etiquetas), con el
 * tamaño por capa del modelo elegido (architecture/laya-y-habilidades.md §5):
 * tarjeta ≤ 60 palabras (Needle y BitNet), resumen ≤ 250 (Bonsai) o completa.
 * PURO: sin red, disco ni reloj; las capacidades llegan inyectadas y el ámbito
 * (cuenta, grupo o página) entra solo por `desactivadas`.
 */

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

/** Conjunto de capacidades con IDs base/fuerte/red/ojos/plan para tests de routing. */
const CAPS: SkillCapability[] = [
  cap("base", "Conocimiento base"),
  cap("fuerte", "Modelo fuerte", { preferStrong: true }),
  cap("red", "Acceso web", { web: true }),
  cap("ojos", "Ver imágenes", { vision: true }),
  cap("plan", "Planificación", { planning: true }),
];

const OPCIONES = { capacidades: CAPACIDADES, desactivadas: [] };
const OPCIONES_CAPS = { capacidades: CAPS, desactivadas: [] };

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

  it("el conjunto exacto por papel sale con el orden del manifiesto (rescate RTTIP1013B)", () => {
    const caps: SkillCapability[] = [
      cap("base", "Conocimiento base"),
      cap("fuerte", "Modelo fuerte", { preferStrong: true }),
      cap("red", "Acceso web", { web: true }),
      cap("ojos", "Ver imágenes", { vision: true }),
      cap("plan", "Planificación", { planning: true }),
    ];
    const opciones = { capacidades: caps, desactivadas: [] };
    expect(ids(habilidadesPara("escritor", "cuenta", opciones))).toEqual(["base", "fuerte", "red", "plan"]);
    expect(ids(habilidadesPara("revisor", "cuenta", opciones))).toEqual(["base", "fuerte", "red"]);
    expect(ids(habilidadesPara("visión", "cuenta", opciones))).toEqual(["base", "fuerte", "ojos"]);
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

  it("voz no recibe las capacidades con sesgo web ni de visión", () => {
    const conSentidos = [...CAPACIDADES, cap("web-senses", "Sentidos web (Agent-Reach)")];
    conSentidos[0].routing = { web: true };
    const voz = ids(habilidadesPara("voz", "cuenta", { capacidades: conSentidos, desactivadas: [] }));
    expect(voz).toContain("av-gen");
    expect(voz).not.toContain("web-senses");
    expect(voz).not.toContain("vision");
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
      expect(ids(habilidadesPara(rol, "cuenta", { capacidades: neutras, desactivadas: [] }) as string[]), rol).toEqual(["vacia", "apagada"]);
    }
  });

  it("el revisor exige calidad fuerte: ni planning ni visión sola", () => {
    const revisor = ids(habilidadesPara("revisor", "cuenta", OPCIONES));
    expect(revisor).toEqual(["av-gen", "taste", "pm", "memoria-agente"]);
    expect(revisor).not.toContain("router-proxy");
    expect(revisor).not.toContain("vision");
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

  it("los directores también eligen, por routing o por etiqueta", () => {
    const pizarra = cap("tldraw", "Pizarra profesional (tldraw)", "Dibuja a mano.", { vision: true });
    const conDiseno = { capacidades: [pizarra, CAPS[2]], desactivadas: [] };
    // …y descarta la de solo web.
    expect(ids(habilidadesPara("diseno", "cuenta", conDiseno))).toEqual(["tldraw"]);
    expect(ids(habilidadesPara("diseño", "cuenta", conDiseno))).toEqual(["tldraw"]);
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
  const longa: SkillCapability[] = [cap("largo", "Larga", { preferStrong: true })];
  longa[0].systemPrompt = largo;

  const contar = (capa: CapaModelo): number =>
    habilidadesPara("escritor", "cuenta", { capacidades: larga, desactivadas: [] }, capa)[0].systemPrompt
      .split(/\s+/).length;

  it("tarjeta ≤ 60 palabras y resumen ≤ 250 (laya-y-habilidades §5)", () => {
    expect(recortarPorCapa(largo, "tarjeta").split(/\s+/)).toHaveLength(60);
    expect(contar("tarjeta")).toBe(60);
    expect(contar("resumen")).toBe(250);
  });

  it("el recorte señala con elipsis el texto que cortó", () => {
    expect(recortarPorCapa(largo, "tarjeta").endsWith("…")).toBe(true);
    expect(recortarPorCapa(largo, "resumen").endsWith("…")).toBe(true);
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

describe("comportamiento adicional", () => {
  it("excluye las desactivadas del ámbito", () => {
    const salida = habilidadesPara("escritor", "cuenta", {
      capacidades: CAPS,
      desactivadas: ["fuerte", "ojos"],
    });
    expect(ids(salida)).toEqual(["base", "red", "plan"]);
  });

  it("entra por etiqueta aunque el routing no encaje", () => {
    const vozWeb = cap("pipecat", "Voz en tiempo real (Pipecat)", "Habla en vivo.", { web: true });
    // Para el papel de voz basta la etiqueta «voz», aunque su routing sea web.
    expect(ids(habilidadesPara("voz", "cuenta", { capacidades: [vozWeb], desactivadas: [] }))).toContain("pipecat");
    // Para el revisor ni la etiqueta ni el encajan: se queda fuera.
    expect(habilidadesPara("revisor", "cuenta", { capacidades: [vozWeb], desactivadas: [] })).toHaveLength(0);
  });

  it("voz no recibe capacidades con sesgo web ni de visión", () => {
    const conSentidos = [...CAPACIDADES, cap("web-senses", "Sentidos web (Agent-Reach)")];
    conSentidos[0].routing = { web: true };
    const voz = ids(habilidadesPara("voz", "cuenta", { capacidades: conSentidos, desactivadas: [] }));
    expect(voz).toContain("av-gen");
    expect(voz).not.toContain("web-senses");
    expect(voz).not.toContain("vision");
  });

  it("los directores eligen por etiquetas: diseño por pizarra", () => {
    const pizarra: SkillCapability = { id: "tldraw", label: "Pizarra profesional (tldraw)", systemPrompt: "x", routing: { vision: true } };
    const conDiseno = { capacidades: [pizarra, CAPS[2]], desactivadas: [] };
    expect(ids(habilidadesPara("diseno", "cuenta", conDiseno))).toEqual(["tldraw"]);
    expect(ids(habilidadesPara("diseño", "cuenta", conDiseno))).toEqual(["tldraw"]);
  });

  it("en grupo o página, la deliberación colectiva sirve a cualquier papel", () => {
    const consejo: SkillCapability = { id: "council", label: "Consejo de Aurora · deliberación política", systemPrompt: "Deliberación.", routing: { preferStrong: true } };
    expect(habilidadesPara("voz", "cuenta", { capacidades: [consejo], desactivadas: [] })).toHaveLength(0);
    expect(ids(habilidadesPara("voz", "página", { capacidades: [consejo], desactivadas: [] }))).toContain("council");
    expect(ids(habilidadesPara("voz", "grupo", { capacidades: [consejo], desactivadas: [] }))).toContain("council");
  });

  it("recorta el prompt por capa: tarjeta ≤ 60, resumen ≤ 250, completa intacta", () => {
    const largo = "palabra ".repeat(300).trim();
    const capsLargo: SkillCapability[] = [{ id: "largo", label: "Larga", systemPrompt: largo, routing: { preferStrong: true } }];
    const opciones = { capacidades: capsLargo, desactivadas: [] };
    const tarjeta = habilidadesPara("chat", "cuenta", opciones, "tarjeta");
    expect(tarjeta[0].systemPrompt.split(/\s+/).length).toBe(60);
    expect(tarjeta[0].systemPrompt.endsWith("…")).toBe(true);
    const resumen = habilidadesPara("chat", "cuenta", opciones, "resumen");
    expect(resumen[0].systemPrompt.split(/\s+/).length).toBe(250);
    const completa = habilidadesPara("chat", "cuenta", opciones, "completa");
    expect(completa[0].systemPrompt).toBe(largo);
  });

  it("no toca un prompt que ya cabe en la capa", () => {
    const corto = "texto breve";
    const capsCorto: SkillCapability[] = [{ id: "corto", label: "Corto", systemPrompt: corto, routing: {} }];
    const opciones = { capacidades: capsCorto, desactivadas: [] };
    const salida = habilidadesPara("chat", "cuenta", opciones, "tarjeta");
    expect(salida[0].systemPrompt).toBe(corto);
  });
});