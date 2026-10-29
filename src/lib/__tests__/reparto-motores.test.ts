import { describe, it, expect } from "vitest";
import { validarReparto, motoresPara, REPARTO, MOTORES } from "../agentes/reparto-motores";

describe("reparto-motores", () => {
  it("validarReparto devuelve vacío", () => {
    expect(validarReparto()).toEqual([]);
  });

  it("escritor-codigo neurona-a1 por defecto", () => {
    const r = motoresPara("escritor-codigo", "neurona-a1");
    expect(r.principal).toBe("opencode");
    expect(r.alternos).toEqual(["codex"]);
  });

  it("escritor-codigo con candidatos admitidos", () => {
    const r = motoresPara("escritor-codigo", "neurona-a1", { admitir: ["activo", "candidato"] });
    expect(r.principal).toBe("opencode");
    expect(r.alternos).toContain("kilo");
    expect(r.alternos).toContain("deepcode");
    expect(r.alternos).toContain("openhands");
  });

  it("supervision-humana descarta referencia", () => {
    const r = motoresPara("supervision-humana", "neurona-a1");
    expect(r.principal).toBe("nativo");
    const descartado = r.descartados.find(d => d.id === "agent-orchestrator");
    expect(descartado).toBeDefined();
    expect(descartado?.motivo).toMatch(/referencia/);
  });

  it("equipo-roles default principal nativo", () => {
    const r = motoresPara("equipo-roles", "neurona-a1");
    expect(r.principal).toBe("nativo");
  });

  it("equipo-roles con invitados", () => {
    const r = motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] });
    expect(r.principal).toBe("crewai");
    const r2 = motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] });
    expect(r2.principal).toBe("nativo");
  });

  it("agente-nativo-movil sin principal", () => {
    const r = motoresPara("agente-nativo-movil", "movil-nativo");
    expect(r.principal).toBeNull();
    expect(r.descartados.some(d => d.id === "koog")).toBe(true);
  });

  it("omo-slim nunca aparece", () => {
    const aparece = Object.values(REPARTO).some(lista => lista.includes("omo-slim"));
    expect(aparece).toBe(false);
    const r = motoresPara("escritor-codigo", "neurona-mac", { admitir: ["activo", "candidato", "invitado", "referencia"] as any });
    expect(r.principal !== "omo-slim").toBe(true);
  });

  it("nativo no está en escritor-codigo", () => {
    expect(REPARTO["escritor-codigo"]).not.toContain("nativo");
  });

  it("admitir referencia no se usa", () => {
    const r = motoresPara("supervision-humana", "neurona-mac", { admitir: ["referencia"] });
    expect(r.principal).toBeNull();
    expect(r.descartados.some(d => d.id === "agent-orchestrator" && d.motivo.includes("referencia"))).toBe(true);
  });
});
