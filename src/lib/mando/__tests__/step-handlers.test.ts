import { describe, it, expect } from "vitest";
import { stepKindUtils } from "@/lib/mando/stepHandlers";
import type { StepKindState, AccountKind } from "@/lib/mando/stepKind";

describe("stepKindUtils - Utilidades puras tipadas", () => {
  describe("isKindValid", () => {
    it("devuelve true para kind individual", () => {
      const state: StepKindState = { kind: "individual" };
      expect(stepKindUtils.isKindValid(state)).toBe(true);
    });

    it("devuelve true para kind grupo", () => {
      const state: StepKindState = { kind: "grupo" };
      expect(stepKindUtils.isKindValid(state)).toBe(true);
    });

    it("devuelve false para kind undefined", () => {
      const state: StepKindState = { kind: undefined };
      expect(stepKindUtils.isKindValid(state)).toBe(false);
    });
  });

  describe("getKindLabel", () => {
    it("devuelve 'Individuo' para kind individual", () => {
      expect(stepKindUtils.getKindLabel("individual")).toBe("Individuo");
    });

    it("devuelve 'Grupo' para kind grupo", () => {
      expect(stepKindUtils.getKindLabel("grupo")).toBe("Grupo");
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindLabel(undefined)).toBeNull();
    });
  });

  describe("getKindDescription", () => {
    it("devuelve la descripción correcta para individual", () => {
      expect(stepKindUtils.getKindDescription("individual")).toBe("Una persona soberana en la red.");
    });

    it("devuelve la descripción correcta para grupo", () => {
      expect(stepKindUtils.getKindDescription("grupo")).toBe("Comunidad / Sangha / colectivo.");
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindDescription(undefined)).toBeNull();
    });
  });

  describe("getKindIcon", () => {
    it("devuelve un componente de icono para individual", () => {
      const icon = stepKindUtils.getKindIcon("individual");
      expect(icon).not.toBeNull();
      expect(typeof icon).toBe("object");
      expect(icon).toHaveProperty("$$typeof");
    });

    it("devuelve un componente de icono para grupo", () => {
      const icon = stepKindUtils.getKindIcon("grupo");
      expect(icon).not.toBeNull();
      expect(typeof icon).toBe("object");
      expect(icon).toHaveProperty("$$typeof");
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindIcon(undefined)).toBeNull();
    });
  });

  describe("Tipado sin any", () => {
    it("stepKindUtils no usa any en sus firmas", () => {
      const state: StepKindState = { kind: "individual" };
      const kind: AccountKind = "grupo";

      expect(typeof stepKindUtils.isKindValid(state)).toBe("boolean");
      expect(typeof stepKindUtils.getKindLabel(kind)).toBe("string");
      expect(typeof stepKindUtils.getKindDescription(kind)).toBe("string");
      const icon = stepKindUtils.getKindIcon(kind);
      expect(icon).not.toBeNull();
      expect(typeof icon).toBe("object");
      expect(icon).toHaveProperty("$$typeof");
    });
  });
});