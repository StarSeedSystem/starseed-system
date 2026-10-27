import { describe, it, expect } from "vitest";
import {
  MOTORES,
  REPARTO,
  motoresPara,
  validarReparto,
  type MedioEjecucion,
  type RolAgente,
} from "@/lib/agentes/reparto-motores";

const ROLES = Object.keys(REPARTO) as RolAgente[];
const MEDIOS: MedioEjecucion[] = [
  "web-publica", "neurona-mac", "neurona-a1", "nube-actions", "movil-nativo",
];

describe("validarReparto", () => {
  it("no encuentra problemas en el reparto declarado", () => {
    expect(validarReparto()).toEqual([]);
  });
});

describe("motoresPara · escritor-codigo", () => {
  it("elige opencode y deja codex de alterno por defecto", () => {
    const reparto = motoresPara("escritor-codigo", "neurona-a1");
    expect(reparto.principal).toBe("opencode");
    expect(reparto.alternos).toEqual(["codex"]);
  });

  it("admite candidatos cuando se piden y respeta el orden de preferencia", () => {
    const reparto = motoresPara("escritor-codigo", "neurona-a1", {
      admitir: ["activo", "candidato"],
    });
    expect(reparto.principal).toBe("opencode");
    expect(reparto.alternos).toEqual(["codex", "kilo", "deepcode", "openhands"]);
  });
});

describe("motoresPara · supervision-humana", () => {
  it("usa el motor nativo y descarta la referencia", () => {
    const reparto = motoresPara("supervision-humana", "neurona-a1");
    expect(reparto.principal).toBe("nativo");
    expect(reparto.descartados).toContainEqual({
      id: "agent-orchestrator",
      motivo: "estado referencia: no se usa como motor",
    });
  });
});

describe("motoresPara · equipo-roles", () => {
  it("prefiere el nativo mientras los invitados no se admiten", () => {
    expect(motoresPara("equipo-roles", "neurona-a1").principal).toBe("nativo");
  });

  it("sube a crewai en la A1 al admitir invitados", () => {
    const reparto = motoresPara("equipo-roles", "neurona-a1", {
      admitir: ["activo", "invitado"],
    });
    expect(reparto.principal).toBe("crewai");
  });

  it("sigue en el nativo en la web pública, donde los invitados no corren", () => {
    const reparto = motoresPara("equipo-roles", "web-publica", {
      admitir: ["activo", "invitado"],
    });
    expect(reparto.principal).toBe("nativo");
  });
});

describe("motoresPara · agente-nativo-movil", () => {
  it("no tiene principal porque koog es solo referencia", () => {
    const reparto = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(reparto.principal).toBeNull();
    expect(reparto.descartados.map((d) => d.id)).toContain("koog");
  });
});

describe("omo-slim", () => {
  it("no aparece en ninguna lista ni llega a principal admitiendo todo", () => {
    for (const lista of Object.values(REPARTO)) {
      expect(lista).not.toContain("omo-slim");
    }
    for (const rol of ROLES) {
      for (const medio of MEDIOS) {
        const reparto = motoresPara(rol, medio, {
          admitir: ["activo", "candidato", "invitado", "referencia"],
        });
        expect(reparto.principal).not.toBe("omo-slim");
      }
    }
  });
});

describe("reglas de admisión", () => {
  it("nunca usa el nativo como escritor de código", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");
  });

  it("no admite referencias ni siquiera pidiéndolas", () => {
    const supervision = motoresPara("supervision-humana", "neurona-a1", {
      admitir: ["referencia"],
    });
    expect(supervision.principal).toBeNull();
    const movil = motoresPara("agente-nativo-movil", "movil-nativo", {
      admitir: ["referencia"],
    });
    expect(movil.principal).toBeNull();
    expect(movil.alternos).toEqual([]);
  });
});

describe("MOTORES", () => {
  it("declara los diecisiete ids del contrato", () => {
    expect(Object.keys(MOTORES)).toHaveLength(17);
  });
});
