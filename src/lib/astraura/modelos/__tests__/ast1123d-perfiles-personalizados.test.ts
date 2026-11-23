import { describe, expect, it } from "vitest";
import type { PerfilPersonalizado, Alcance, Pesos, Preferencias } from "../perfiles-personalizados";
import {
  validarPerfil,
  crearPerfil,
  exportarPerfil,
  importarPerfil,
  tipoAlcance,
  pesosValidos,
  preferenciasValidas,
  normalizarPerfiles,
  filtrarPorAlcance,
  combinarPreferencias,
} from "../perfiles-personalizados";

const HOY = new Date().toISOString().split("T")[0];

function perfilBase(id: string, alcance: PerfilPersonalizado["alcance"] = "agente"): PerfilPersonalizado {
  return {
    id,
    alcance,
    objetivoId: `obj-${id}`,
    preferencias: { proveedores: [], repos: [] },
    pesos: { latencia: 0.5, calidad: 0.5, privacidad: 0, ahorro: 0 },
    creadoEn: HOY,
  };
}

describe("validarPerfil", () => {
  it("rechaza un perfil sin id", () => {
    expect(() => validarPerfil({})).toThrow();
  });

  it("rechaza un perfil con alcance inválido", () => {
    expect(() => validarPerfil({ id: "test", alcance: "invalido" as any })).toThrow();
  });

  it("rechaza un perfil sin objetivoId", () => {
    expect(() => validarPerfil({ id: "test", alcance: "agente" })).toThrow();
  });

  it("rechaza un perfil con pesos fuera de rango", () => {
    expect(() =>
      validarPerfil({ id: "test", alcance: "agente", objetivoId: "obj1", preferencias: { proveedores: [], repos: [] }, pesos: { latencia: 1.5, calidad: 0, privacidad: 0, ahorro: 0 } })
    ).toThrow();
  });

  it("acepta un perfil válido completo", () => {
    const raw = {
      id: "perfil-1",
      alcance: "agente" as const,
      objetivoId: "agente-xyz",
      preferencias: { proveedores: ["hf.co"], repos: ["ollama"] },
      pesos: { latencia: 0.3, calidad: 0.5, privacidad: 0.2, ahorro: 0 },
      creadoEn: "2026-11-23",
    };
    expect(() => validarPerfil(raw)).not.toThrow();
  });
});

describe("crearPerfil", () => {
  it("crea un perfil con fecha de creación automática", () => {
    const hoy = new Date().toISOString().split("T")[0];
    const perfil = crearPerfil({
      id: "mi-perfil",
      alcance: "neurona",
      objetivoId: "neurona-abc",
      preferencias: { proveedores: ["nomic"], repos: [] },
      pesos: { latencia: 0.5, calidad: 0.3, privacidad: 0.2, ahorro: 0 },
    });
    expect(perfil.id).toBe("mi-perfil");
    expect(perfil.alcance).toBe("neurona");
    expect(perfil.objetivoId).toBe("neurona-abc");
    expect(perfil.creadoEn).toBe(hoy);
  });

  it("permite limites opcionales", () => {
    const perfil = crearPerfil({
      id: "perfil-limite",
      alcance: "bot",
      objetivoId: "bot-1",
      preferencias: { proveedores: [], repos: [] },
      pesos: { latencia: 0.2, calidad: 0.5, privacidad: 0.2, ahorro: 0.1 },
      limites: { contextoMaxTokens: 4096 },
    });
    expect(perfil.limites?.contextoMaxTokens).toBe(4096);
  });
});

describe("exportarPerfil / importarPerfil", () => {
  it("exporta a JSON válido", () => {
    const perfil = crearPerfil({
      id: "exp-1",
      alcance: "capa",
      objetivoId: "capa-abc",
      preferencias: { proveedores: ["hf.co"], repos: ["ollama"] },
      pesos: { latencia: 0.4, calidad: 0.4, privacidad: 0.1, ahorro: 0.1 },
    });
    const json = exportarPerfil(perfil);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe("exp-1");
  });

  it("importa correctamente el JSON", () => {
    const raw = {
      id: "import-1",
      alcance: "agente",
      objetivoId: "obj-xyz",
      preferencias: { proveedores: ["groq"], repos: ["lmstudio"] },
      pesos: { latencia: 0.3, calidad: 0.4, privacidad: 0.2, ahorro: 0.1 },
      creadoEn: "2026-11-20",
      limites: { contextoMaxTokens: 8192 },
    };
    const importado = importarPerfil(JSON.stringify(raw));
    expect(importado.id).toBe("import-1");
    expect(importado.limites?.contextoMaxTokens).toBe(8192);
  });

  it("lanza error si el JSON es inválido", () => {
    expect(() => importarPerfil("not json")).toThrow();
  });
});

describe("tipoAlcance", () => {
  it("clasifica correctamente por id y contexto", () => {
    expect(tipoAlcance("agent-123", "agente")).toBe("agente");
    expect(tipoAlcance("bot-gpt", "bot")).toBe("bot");
    expect(tipoAlcance("neuron-456", "neurona")).toBe("neurona");
    expect(tipoAlcance("capa-789", "capa")).toBe("capa");
  });
});

describe("pesosValidos", () => {
  it("devuelve true para pesos que suman 1 o menos", () => {
    expect(pesosValidos({ latencia: 0.3, calidad: 0.3, privacidad: 0.2, ahorro: 0.2 })).toBe(true);
    expect(pesosValidos({ latencia: 1, calidad: 0, privacidad: 0, ahorro: 0 })).toBe(true);
    expect(pesosValidos({ latencia: 0, calidad: 0, privacidad: 0, ahorro: 0 })).toBe(true);
  });

  it("devuelve false para pesos que suman más de 1", () => {
    expect(pesosValidos({ latencia: 0.5, calidad: 0.5, privacidad: 0.1, ahorro: 0.1 })).toBe(false);
  });
});

describe("preferenciasValidas", () => {
  it("acepta preferencias con arrays vacíos", () => {
    expect(preferenciasValidas({ proveedores: [], repos: [] })).toBe(true);
  });

  it("rechaza proveedores duplicados", () => {
    expect(preferenciasValidas({ proveedores: ["hf.co", "hf.co"], repos: [] })).toBe(false);
  });

  it("rechaza repos duplicados", () => {
    expect(preferenciasValidas({ proveedores: [], repos: ["ollama", "ollama"] })).toBe(false);
  });
});

describe("normalizarPerfiles", () => {
  it("elimina duplicados y normaliza ids", () => {
    const perfiles: PerfilPersonalizado[] = [
      perfilBase("P1"),
      { ...perfilBase("p1"), pesos: { latencia: 0.3, calidad: 0.3, privacidad: 0.2, ahorro: 0.2 } },
    ];
    const normalizados = normalizarPerfiles(perfiles);
    expect(normalizados).toHaveLength(1);
    expect(normalizados[0].pesos.calidad).toBe(0.5);
    expect(normalizados[0].id).toBe("p1");
  });
});

describe("filtrarPorAlcance", () => {
  const perfiles: PerfilPersonalizado[] = [
    perfilBase("p1", "agente"),
    perfilBase("p2", "bot"),
    perfilBase("p3", "neurona"),
  ];

  it("filtra por agente", () => {
    expect(filtrarPorAlcance(perfiles, "agente")).toHaveLength(1);
  });

  it("filtra por bot", () => {
    expect(filtrarPorAlcance(perfiles, "bot")).toHaveLength(1);
  });

  it("filtra por neurona", () => {
    expect(filtrarPorAlcance(perfiles, "neurona")).toHaveLength(1);
  });
});

describe("combinarPreferencias", () => {
  it("combina dos conjuntos de preferencias", () => {
    const p1 = { proveedores: ["hf.co"], repos: ["ollama"] };
    const p2 = { proveedores: ["groq"], repos: ["lmstudio"] };
    const combinados = combinarPreferencias(p1, p2);
    expect(combinados.proveedores).toEqual(["hf.co", "groq"]);
    expect(combinados.repos).toEqual(["ollama", "lmstudio"]);
  });

  it("elimina duplicados al combinar", () => {
    const p1 = { proveedores: ["hf.co", "groq"], repos: [] };
    const p2 = { proveedores: ["hf.co"], repos: ["ollama", "ollama"] };
    const combinados = combinarPreferencias(p1, p2);
    expect(combinados.proveedores).toEqual(["hf.co", "groq"]);
    expect(combinados.repos).toEqual(["ollama"]);
  });
});