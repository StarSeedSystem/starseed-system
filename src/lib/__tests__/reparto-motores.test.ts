import { describe, it, expect } from "vitest";
import {
  REPARTO,
  motoresPara,
  validarReparto,
  type EstadoMotor,
  type MedioEjecucion,
  type RolAgente,
} from "@/lib/agentes/reparto-motores";

const ESTADOS: EstadoMotor[] = ["activo", "candidato", "invitado", "referencia"];
const ROLES = Object.keys(REPARTO) as RolAgente[];
const MEDIOS: MedioEjecucion[] = [
  "web-publica",
  "neurona-mac",
  "neurona-a1",
  "nube-actions",
  "movil-nativo",
];

describe("reparto de motores por rol y medio", () => {
  it("validarReparto no encuentra problemas", () => {
    expect(validarReparto()).toEqual([]);
  });

  it("escritor-codigo: opencode manda, codex alterna y los candidatos entran al admitirlos", () => {
    const porDefecto = motoresPara("escritor-codigo", "neurona-a1");
    expect(porDefecto.principal).toBe("opencode");
    expect(porDefecto.alternos).toEqual(["codex"]);

    const conCandidatos = motoresPara("escritor-codigo", "neurona-a1", {
      admitir: ["activo", "candidato"],
    });
    expect(conCandidatos.principal).toBe("opencode");
    expect(conCandidatos.alternos).toEqual(
      expect.arrayContaining(["kilo", "deepcode", "openhands"]),
    );
  });

  it("supervision-humana: nativo manda y Agent Orchestrator queda fuera por referencia", () => {
    const reparto = motoresPara("supervision-humana", "neurona-a1");
    expect(reparto.principal).toBe("nativo");
    expect(reparto.descartados).toContainEqual({
      id: "agent-orchestrator",
      motivo: expect.stringContaining("referencia"),
    });
  });

  it("equipo-roles: nativo por defecto, CrewAI con invitados y solo donde corre", () => {
    expect(motoresPara("equipo-roles", "neurona-a1").principal).toBe("nativo");
    expect(
      motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] }).principal,
    ).toBe("crewai");
    expect(
      motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] }).principal,
    ).toBe("nativo");
  });

  it("agente-nativo-movil: Koog no sirve mientras siga siendo referencia", () => {
    const reparto = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(reparto.principal).toBeNull();
    expect(reparto.descartados.some((d) => d.id === "koog")).toBe(true);
  });

  it("omo-slim no aparece en ninguna lista ni acaba como principal de nada", () => {
    for (const lista of Object.values(REPARTO)) {
      expect(lista).not.toContain("omo-slim");
    }
    for (const rol of ROLES) {
      for (const medio of MEDIOS) {
        const reparto = motoresPara(rol, medio, { admitir: ESTADOS });
        expect(reparto.principal).not.toBe("omo-slim");
        expect(reparto.alternos).not.toContain("omo-slim");
      }
    }
  });

  it("nativo no es escritor de código y las referencias no se admiten nunca", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");

    const soloReferencias = motoresPara("supervision-humana", "neurona-a1", {
      admitir: ["referencia"],
    });
    expect(soloReferencias.principal).toBeNull();
    expect(soloReferencias.alternos).toEqual([]);
  });
});
