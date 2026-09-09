import { describe, expect, it } from "vitest";
import {
  CAPACIDADES_CONOCIDAS,
  LIMITES_POR_DEFECTO,
  capacidadesEfectivas,
  puedeInvocar,
  sanearParaGrupo,
  validarAgenteGrupo,
  type AgenteGrupo,
  type AgentePersonal,
} from "@/lib/agents/agentes-grupo";

// Por qué existe este test (Ola 307, 2026-09-09): la IA puede crear agentes para
// grupos de cualquier tipo, y un agente público lo invoca mucha gente. Aquí se
// vigilan las dos costuras peligrosas: (1) que al llevar un agente personal al
// grupo NO viaje la vida de su dueño —memoria, claves, cerebros privados— y
// (2) que un agente inventado por un modelo no entre sin que alguien lo mire.

/** Un agente personal con todo lo que NO debe cruzar al grupo. */
function agentePersonal(): AgentePersonal {
  return {
    id: "agente-alex",
    name: "Escriba",
    description: "Redacta actas y resúmenes",
    persona: "Eres el escriba de Alex.",
    capabilities: ["taste", "pm"],
    model: {
      preferStrong: true,
      preferredSourceId: "groq-free",
      preferredModel: "llama-3.3-70b",
      temperature: 0.4,
    },
    icon: "NotebookPen",
    author: "alex",
    visibility: "private",
    version: "1.2.0",
    builtin: false,
    createdAt: 1_000,
    updatedAt: 2_000,
    memoriaPersonal: { diario: "hoy discutí con mi hermana", contactos: ["mamá"] },
    claves: { groq: "clave-personal-de-alex" },
    cerebrosPrivados: ["cerebro-diario"],
    bindings: [
      { agentId: "agente-alex", targetType: "profile", targetId: "alex", scope: "public", at: 10 },
      { agentId: "agente-alex", targetType: "page", targetId: "/diario", scope: "private", at: 11 },
      { agentId: "agente-alex", targetType: "message", targetId: "hilo-1", scope: "private", at: 12 },
      { agentId: "agente-alex", targetType: "group", targetId: "grupo-huerto", scope: "public", at: 13 },
    ],
  };
}

describe("sanearParaGrupo · lo que se comparte es la configuración, no la vida", () => {
  const saneado = sanearParaGrupo(agentePersonal(), "grupo-huerto", "alex");

  it("no deja ni un campo de la vida personal del creador", () => {
    expect("memoriaPersonal" in saneado).toBe(false);
    expect("claves" in saneado).toBe(false);
    expect("cerebrosPrivados" in saneado).toBe(false);
    expect("builtin" in saneado).toBe(false);
    // Red de seguridad: nada del contenido personal sobrevive al serializar.
    const serializado = JSON.stringify(saneado);
    expect(serializado).not.toContain("clave-personal-de-alex");
    expect(serializado).not.toContain("hoy discutí con mi hermana");
    expect(serializado).not.toContain("cerebro-diario");
  });

  it("tira la fuente preferida atada a una clave personal y conserva el gusto", () => {
    expect(saneado.model?.preferredSourceId).toBeUndefined();
    expect(saneado.model?.preferredModel).toBe("llama-3.3-70b");
    expect(saneado.model?.preferStrong).toBe(true);
    expect(saneado.model?.temperature).toBe(0.4);
  });

  it("conserva una fuente local, que no depende de la cuenta de nadie", () => {
    const conLocal = agentePersonal();
    conLocal.model = { preferredSourceId: "ollama-local" };
    expect(sanearParaGrupo(conLocal, "grupo-huerto", "alex").model?.preferredSourceId).toBe(
      "ollama-local",
    );
  });

  it("solo sobreviven los vínculos a superficies compartidas", () => {
    expect(saneado.bindings).toHaveLength(1);
    expect(saneado.bindings[0]?.targetType).toBe("group");
    expect(saneado.bindings[0]?.targetId).toBe("grupo-huerto");
  });

  it("mantiene la configuración y firma el linaje y la responsabilidad", () => {
    expect(saneado.capabilities).toEqual(["taste", "pm"]);
    expect(saneado.persona).toBe("Eres el escriba de Alex.");
    expect(saneado.grupoId).toBe("grupo-huerto");
    expect(saneado.creadoPor).toBe("alex");
    expect(saneado.author).toBe("alex");
    expect(saneado.parentId).toBe("agente-alex");
    expect(saneado.id).toBe("agente-alex@grupo-huerto");
    expect(saneado.memoriaAlcance).toBe("grupo");
  });
});

describe("LIMITES_POR_DEFECTO · un agente nuevo no puede casi nada", () => {
  it("nace sin escritura, sin internet y sin capacidades concedidas", () => {
    expect(LIMITES_POR_DEFECTO.puedeEscribir).toBe(false);
    expect(LIMITES_POR_DEFECTO.puedeSalirAInternet).toBe(false);
    expect(LIMITES_POR_DEFECTO.capacidades).toEqual([]);
    expect(LIMITES_POR_DEFECTO.invocacionesPorHora).toBe(60);
  });

  it("el agente saneado hereda esos límites y no puede ejercer nada todavía", () => {
    const saneado = sanearParaGrupo(agentePersonal(), "grupo-huerto", "alex");
    expect(saneado.limites).toEqual(LIMITES_POR_DEFECTO);
    expect(saneado.rolesQuePuedenInvocar).toEqual([]);
    // Sabe hacer dos cosas, pero el grupo aún no le ha concedido ninguna.
    expect(capacidadesEfectivas(saneado)).toEqual([]);
    saneado.limites = { ...saneado.limites, capacidades: ["pm"] };
    expect(capacidadesEfectivas(saneado)).toEqual(["pm"]);
  });
});

describe("puedeInvocar · se concede por rol, no por nombre", () => {
  const base = sanearParaGrupo(agentePersonal(), "grupo-huerto", "alex");
  const conRoles: AgenteGrupo = { ...base, rolesQuePuedenInvocar: ["moderación", "Tesorería"] };

  it("deja pasar un rol concedido, sin importar mayúsculas ni espacios", () => {
    expect(puedeInvocar(conRoles, "moderación")).toBe(true);
    expect(puedeInvocar(conRoles, "  tesorería ")).toBe(true);
  });

  it("no deja pasar un rol que el grupo no concedió", () => {
    expect(puedeInvocar(conRoles, "visitante")).toBe(false);
    expect(puedeInvocar(conRoles, "")).toBe(false);
  });

  it("sin roles concedidos no invoca nadie; con «*» invoca cualquier miembro", () => {
    expect(puedeInvocar(base, "moderación")).toBe(false);
    expect(puedeInvocar({ ...base, rolesQuePuedenInvocar: ["*"] }, "visitante")).toBe(true);
  });
});

/** Propuesta correcta, del estilo de la que devolvería la IA. */
function propuesta(): Record<string, unknown> {
  return {
    id: "agente-actas",
    name: "Actas del huerto",
    description: "Toma acta de las asambleas",
    persona: "Eres el escriba del grupo: resumes acuerdos, no opinas.",
    capabilities: ["taste", "pm"],
    icon: "NotebookPen",
    author: "alex",
    visibility: "public",
    version: "1.0.0",
    createdAt: 1,
    updatedAt: 2,
    grupoId: "grupo-huerto",
    creadoPor: "alex",
    rolesQuePuedenInvocar: ["miembro"],
    memoriaAlcance: "grupo",
    limites: {
      invocacionesPorHora: 30,
      capacidades: ["pm"],
      puedeSalirAInternet: false,
      puedeEscribir: true,
    },
  };
}

describe("validarAgenteGrupo · se mira lo que propone la IA antes de creerlo", () => {
  it("acepta una propuesta bien formada", () => {
    const { agente, problemas } = validarAgenteGrupo(propuesta());
    expect(problemas).toEqual([]);
    expect(agente?.grupoId).toBe("grupo-huerto");
    expect(agente?.limites.puedeEscribir).toBe(true);
    expect(agente ? capacidadesEfectivas(agente) : []).toEqual(["pm"]);
  });

  it("rechaza capacidades inventadas y las nombra una por una", () => {
    const inventado = { ...propuesta(), capabilities: ["taste", "telepatía-cuántica", "leer-la-mente"] };
    const { agente, problemas } = validarAgenteGrupo(inventado);
    expect(agente).toBeNull();
    expect(problemas.some((p) => p.includes("telepatía-cuántica"))).toBe(true);
    expect(problemas.some((p) => p.includes("leer-la-mente"))).toBe(true);
    expect(problemas.some((p) => p.includes("taste"))).toBe(false);
    expect(CAPACIDADES_CONOCIDAS).toContain("taste");
  });
});

describe("validarAgenteGrupo · los límites y la privacidad no son opinables", () => {
  it("rechaza un tope de invocaciones fuera de rango", () => {
    const abusivo = { ...propuesta(), limites: { ...(propuesta().limites as object), invocacionesPorHora: 100_000 } };
    const { agente, problemas } = validarAgenteGrupo(abusivo);
    expect(agente).toBeNull();
    expect(problemas.some((p) => p.includes("invocacionesPorHora"))).toBe(true);
  });

  it("rechaza una propuesta que intenta colar memoria o claves personales", () => {
    const contaminada = {
      ...propuesta(),
      memoriaPersonal: { diario: "…" },
      claves: { groq: "clave-personal-de-alex" },
    };
    const { agente, problemas } = validarAgenteGrupo(contaminada);
    expect(agente).toBeNull();
    expect(problemas.some((p) => p.includes("memoriaPersonal"))).toBe(true);
    expect(problemas.some((p) => p.includes("claves"))).toBe(true);
  });

  it("rechaza un vínculo a una superficie privada y avisa sin grupo no hay agente", () => {
    const atada = {
      ...propuesta(),
      bindings: [{ agentId: "agente-actas", targetType: "profile", targetId: "alex", scope: "public", at: 1 }],
    };
    expect(validarAgenteGrupo(atada).agente).toBeNull();

    const sinGrupo = { ...propuesta(), grupoId: "  " };
    const { agente, problemas } = validarAgenteGrupo(sinGrupo);
    expect(agente).toBeNull();
    expect(problemas.some((p) => p.includes("grupoId"))).toBe(true);
  });

  it("rechaza lo que ni siquiera es un agente", () => {
    expect(validarAgenteGrupo(null).agente).toBeNull();
    expect(validarAgenteGrupo("un agente majo").problemas).toHaveLength(1);
  });
});
