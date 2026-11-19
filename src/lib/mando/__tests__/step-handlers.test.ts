import { describe, it, expect, vi } from "vitest";
import { stepKindHandlers, stepKindUtils } from "@/lib/mando/stepHandlers";
import type { StepKindState, AccountKind, StepKindHandlers, StepKindUtils } from "@/lib/mando/stepKind";

describe("StepKindHandlers - Estructura de handlers tipados", () => {
  it("stepKindHandlers exporta StepKind y KindCard como ComponentType", () => {
    expect(stepKindHandlers.StepKind).toBeDefined();
    expect(stepKindHandlers.KindCard).toBeDefined();
    expect(typeof stepKindHandlers.StepKind).toBe("function");
    expect(typeof stepKindHandlers.KindCard).toBe("function");
  });

  it("StepKindHandlers cumple la interfaz StepKindHandlers", () => {
    const handlers: StepKindHandlers = stepKindHandlers;
    expect(handlers.StepKind).toBeDefined();
    expect(handlers.KindCard).toBeDefined();
  });
});

describe("StepKindUtils - Utilidades puras tipadas", () => {
  it("isKindValid retorna true para individual", () => {
    const state: StepKindState = { kind: "individual" };
    expect(stepKindUtils.isKindValid(state)).toBe(true);
  });

  it("isKindValid retorna true para grupo", () => {
    const state: StepKindState = { kind: "grupo" };
    expect(stepKindUtils.isKindValid(state)).toBe(true);
  });

  it("isKindValid retorna false para undefined", () => {
    const state: StepKindState = { kind: undefined };
    expect(stepKindUtils.isKindValid(state)).toBe(false);
  });

  it("isKindValid retorna false para kind inválido", () => {
    const state: StepKindState = { kind: "otro" as AccountKind };
    expect(stepKindUtils.isKindValid(state)).toBe(false);
  });

  it("getKindLabel retorna etiqueta correcta para individual", () => {
    expect(stepKindUtils.getKindLabel("individual")).toBe("Individuo");
  });

  it("getKindLabel retorna etiqueta correcta para grupo", () => {
    expect(stepKindUtils.getKindLabel("grupo")).toBe("Grupo");
  });

  it("getKindLabel retorna null para undefined", () => {
    expect(stepKindUtils.getKindLabel(undefined)).toBeNull();
  });

  it("getKindDescription retorna descripción correcta para individual", () => {
    expect(stepKindUtils.getKindDescription("individual")).toBe("Una persona soberana en la red.");
  });

  it("getKindDescription retorna descripción correcta para grupo", () => {
    expect(stepKindUtils.getKindDescription("grupo")).toBe("Comunidad / Sangha / colectivo.");
  });

  it("getKindDescription retorna null para undefined", () => {
    expect(stepKindUtils.getKindDescription(undefined)).toBeNull();
  });

  it("getKindIcon retorna componente User para individual", () => {
    const icon = stepKindUtils.getKindIcon("individual");
    expect(icon).toBeDefined();
    expect(icon?.displayName || icon?.name).toBe("User");
  });

  it("getKindIcon retorna componente Users para grupo", () => {
    const icon = stepKindUtils.getKindIcon("grupo");
    expect(icon).toBeDefined();
    expect(icon?.displayName || icon?.name).toBe("Users");
  });

  it("getKindIcon retorna null para undefined", () => {
    expect(stepKindUtils.getKindIcon(undefined)).toBeNull();
  });

  it("StepKindUtils cumple la interfaz StepKindUtils", () => {
    const utils: StepKindUtils = stepKindUtils;
    expect(typeof utils.isKindValid).toBe("function");
    expect(typeof utils.getKindLabel).toBe("function");
    expect(typeof utils.getKindDescription).toBe("function");
    expect(typeof utils.getKindIcon).toBe("function");
  });
});