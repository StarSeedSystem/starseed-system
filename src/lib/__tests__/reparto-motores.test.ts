import { describe, it, expect } from "vitest";
import {
  MOTORES,
  REPARTO,
  motoresPara,
  validarReparto,
  type EstadoMotor,
  type MedioEjecucion,
  type RolAgente,
} from "@/lib/agentes/reparto-motores";

// Por qué existe este test (2026-10-25, Ola 1025R · AGT1025A): el reparto de
// motores vivía solo en prosa. Aquí se vigila que siga siendo coherente y que
// elija por la forma del trabajo y el medio, con `referencia` siempre fuera.

const ROLES = Object.keys(REPARTO) as RolAgente[];
const MEDIOS: MedioEjecucion[] = [
  "web-publica", "neurona-mac", "neurona-a1", "nube-actions", "movil-nativo",
];
const TODOS_LOS_ESTADOS: EstadoMotor[] = ["activo", "candidato", "invitado", "referencia"];

describe("validarReparto", () => {
  it("no encuentra problemas en la tabla declarada", () => {
    expect(validarReparto()).toEqual([]);
  });
});

describe("motoresPara · escritor de código", () => {
  it("elige opencode en la neurona A1 y deja codex como alterno", () => {
    const r = motoresPara("escritor-codigo", "neurona-a1");
    expect(r.principal).toBe("opencode");
    expect(r.alternos).toEqual(["codex"]);
  });

  it("suma los candidatos cuando se admiten", () => {
    const r = motoresPara("escritor-codigo", "neurona-a1", { admitir: ["activo", "candidato"] });
    expect(r.principal).toBe("opencode");
    expect(r.alternos).toEqual(["codex", "kilo", "deepcode", "openhands"]);
  });

  it("no pone a nativo a escribir código", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");
  });
});

describe("motoresPara · supervisión humana", () => {
  it("usa nativo y descarta Agent Orchestrator por ser referencia", () => {
    const r = motoresPara("supervision-humana", "neurona-a1");
    expect(r.principal).toBe("nativo");
    expect(r.descartados).toContainEqual({
      id: "agent-orchestrator",
      motivo: "estado referencia: no se usa como motor",
    });
  });
});

describe("motoresPara · equipo por roles", () => {
  it("por defecto usa el panel nativo", () => {
    expect(motoresPara("equipo-roles", "neurona-a1").principal).toBe("nativo");
  });

  it("con invitados admitidos prefiere CrewAI en el A1", () => {
    const r = motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] });
    expect(r.principal).toBe("crewai");
  });

  it("en la web pública vuelve a nativo porque CrewAI no corre ahí", () => {
    const r = motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] });
    expect(r.principal).toBe("nativo");
  });
});

describe("motoresPara · móvil y referencias", () => {
  it("no elige Koog en móvil porque es referencia", () => {
    const r = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(r.principal).toBeNull();
    expect(r.descartados.map((d) => d.id)).toEqual(["koog"]);
  });

  it("pedir solo referencias no las admite", () => {
    expect(motoresPara("agente-nativo-movil", "movil-nativo", { admitir: ["referencia"] }).principal).toBeNull();
    expect(motoresPara("supervision-humana", "neurona-a1", { admitir: ["referencia"] }).principal).toBeNull();
  });
});

describe("oh-my-opencode-slim", () => {
  it("no aparece en ninguna lista del reparto", () => {
    for (const rol of ROLES) expect(REPARTO[rol]).not.toContain("omo-slim");
  });

  it("nunca es principal aunque se admitan todos los estados", () => {
    for (const rol of ROLES) {
      for (const medio of MEDIOS) {
        const r = motoresPara(rol, medio, { admitir: TODOS_LOS_ESTADOS });
        expect(r.principal).not.toBe("omo-slim");
      }
    }
  });

  it("declara que no tiene medios de ejecución", () => {
    expect(MOTORES["omo-slim"].medios).toEqual([]);
  });
});
