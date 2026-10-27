// Pruebas del reparto de motores por rol (AGT1025A).
import { describe, it, expect } from "vitest";
import { MOTORES, REPARTO, motoresPara, validarReparto } from "../agentes/reparto-motores";
import type { EstadoMotor, MedioEjecucion, RolAgente } from "../agentes/reparto-motores";

const MEDIOS: MedioEjecucion[] = ["web-publica", "neurona-mac", "neurona-a1", "nube-actions", "movil-nativo"];
const ESTADOS: EstadoMotor[] = ["activo", "candidato", "invitado", "referencia"];

describe("reparto-motores", () => {
  it("validarReparto no encuentra problemas", () => {
    expect(validarReparto()).toEqual([]);
  });

  it("escritor-codigo prefiere opencode y suma candidatos solo si se admiten", () => {
    const porDefecto = motoresPara("escritor-codigo", "neurona-a1");
    expect(porDefecto.principal).toBe("opencode");
    expect(porDefecto.alternos).toEqual(["codex"]);

    const amplio = motoresPara("escritor-codigo", "neurona-a1", { admitir: ["activo", "candidato"] });
    expect(amplio.principal).toBe("opencode");
    expect(amplio.alternos).toEqual(["codex", "kilo", "deepcode", "openhands"]);
  });

  it("supervision-humana descarta Agent Orchestrator por ser referencia", () => {
    const r = motoresPara("supervision-humana", "neurona-a1");
    expect(r.principal).toBe("nativo");
    const descartado = r.descartados.find((d) => d.id === "agent-orchestrator");
    expect(descartado?.motivo).toContain("referencia");
  });

  it("equipo-roles usa nativo por defecto, crewai con invitados y nativo fuera de su medio", () => {
    expect(motoresPara("equipo-roles", "neurona-a1").principal).toBe("nativo");
    expect(motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] }).principal).toBe("crewai");
    expect(motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] }).principal).toBe("nativo");
  });

  it("agente-nativo-movil no tiene principal y descarta a koog por referencia", () => {
    const r = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(r.principal).toBeNull();
    expect(r.alternos).toEqual([]);
    const descartado = r.descartados.find((d) => d.id === "koog");
    expect(descartado?.motivo).toContain("referencia");
  });

  it("omo-slim no entra en ninguna lista ni gana ningún rol", () => {
    for (const lista of Object.values(REPARTO)) {
      expect(lista).not.toContain("omo-slim");
    }
    for (const rol of Object.keys(REPARTO) as RolAgente[]) {
      for (const medio of MEDIOS) {
        expect(motoresPara(rol, medio, { admitir: ESTADOS }).principal).not.toBe("omo-slim");
      }
    }
  });

  it("nativo no figura como escritor de código", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");
  });

  it("pedir referencia no admite referencias", () => {
    const r = motoresPara("escritor-codigo", "neurona-a1", { admitir: ["referencia"] });
    expect(r.principal).toBeNull();
    expect(r.alternos).toEqual([]);
    expect(r.descartados.every((d) => d.motivo.includes("referencia") || d.motivo.includes("no admitido"))).toBe(true);
  });

  it("los motores candidatos e invitados llevan aviso", () => {
    for (const [id, motor] of Object.entries(MOTORES)) {
      if (motor.estado === "candidato" || motor.estado === "invitado") {
        expect(motor.aviso.trim().length, id).toBeGreaterThan(0);
      }
    }
  });
});
