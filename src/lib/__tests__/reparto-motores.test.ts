import { describe, expect, it } from "vitest";
import {
  MOTORES,
  REPARTO,
  motoresPara,
  validarReparto,
  type MedioEjecucion,
  type RolAgente,
} from "@/lib/agentes/reparto-motores";

const MEDIOS: MedioEjecucion[] = [
  "web-publica",
  "neurona-mac",
  "neurona-a1",
  "nube-actions",
  "movil-nativo",
];

describe("reparto de motores por rol y medio", () => {
  it("el reparto es coherente y no tiene huecos", () => {
    expect(validarReparto()).toEqual([]);
  });

  it("escritor de código: opencode primero y codex como alterno", () => {
    const base = motoresPara("escritor-codigo", "neurona-a1");
    expect(base.principal).toBe("opencode");
    expect(base.alternos).toEqual(["codex"]);

    const amplio = motoresPara("escritor-codigo", "neurona-a1", {
      admitir: ["activo", "candidato"],
    });
    expect(amplio.alternos).toEqual(expect.arrayContaining(["kilo", "deepcode", "openhands"]));
  });

  it("supervisión humana: nativo manda y Agent Orchestrator queda por referencia", () => {
    const reparto = motoresPara("supervision-humana", "neurona-a1");
    expect(reparto.principal).toBe("nativo");
    const orchestrator = reparto.descartados.find((d) => d.id === "agent-orchestrator");
    expect(orchestrator?.motivo).toContain("referencia");
  });

  it("equipo por roles: nativo por defecto, CrewAI solo como invitado en su medio", () => {
    expect(motoresPara("equipo-roles", "neurona-a1").principal).toBe("nativo");
    expect(
      motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] }).principal,
    ).toBe("crewai");
    expect(
      motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] }).principal,
    ).toBe("nativo");
  });

  it("agente nativo móvil: sin app Kotlin no hay principal y Koog se descarta", () => {
    const reparto = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(reparto.principal).toBeNull();
    expect(reparto.descartados.map((d) => d.id)).toContain("koog");
  });

  it("omo-slim no está en ninguna lista y nunca es principal", () => {
    expect(Object.values(REPARTO).flat()).not.toContain("omo-slim");
    for (const rol of Object.keys(REPARTO) as RolAgente[]) {
      for (const medio of MEDIOS) {
        const reparto = motoresPara(rol, medio, {
          admitir: ["activo", "candidato", "invitado", "referencia"],
        });
        expect(reparto.principal).not.toBe("omo-slim");
      }
    }
  });

  it("nativo no escribe código en el reparto y pedir referencia no la admite", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");
    expect(MOTORES["koog"].estado).toBe("referencia");
    expect(
      motoresPara("agente-nativo-movil", "movil-nativo", { admitir: ["referencia"] }).principal,
    ).toBeNull();
  });
});
