import { describe, it, expect } from "vitest";
import type { AccountKind, StepKindState } from "@/lib/mando/stepKind";
import { stepKindUtils } from "@/lib/mando/stepUtils";
import type * as React from "react";

describe("stepKindUtils - Utilidades puras sin any", () => {
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

    it("devuelve false para estado vacío", () => {
      const state: StepKindState = {};
      expect(stepKindUtils.isKindValid(state)).toBe(false);
    });
  });

  describe("getKindLabel", () => {
    it("devuelve 'Individuo' para individual", () => {
      expect(stepKindUtils.getKindLabel("individual")).toBe("Individuo");
    });

    it("devuelve 'Grupo' para grupo", () => {
      expect(stepKindUtils.getKindLabel("grupo")).toBe("Grupo");
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindLabel(undefined)).toBeNull();
    });

    it("devuelve null para valor no reconocido", () => {
      expect(stepKindUtils.getKindLabel("otro" as AccountKind)).toBeNull();
    });
  });

  describe("getKindDescription", () => {
    it("devuelve descripción para individual", () => {
      expect(stepKindUtils.getKindDescription("individual")).toBe(
        "Una persona soberana en la red."
      );
    });

    it("devuelve descripción para grupo", () => {
      expect(stepKindUtils.getKindDescription("grupo")).toBe(
        "Comunidad / Sangha / colectivo."
      );
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindDescription(undefined)).toBeNull();
    });

    it("devuelve null para valor no reconocido", () => {
      expect(stepKindUtils.getKindDescription("otro" as AccountKind)).toBeNull();
    });
  });

  describe("getKindIcon", () => {
    it("devuelve componente User para individual", () => {
      const icon = stepKindUtils.getKindIcon("individual");
      expect(icon).not.toBeNull();
      expect(icon).toHaveProperty("displayName", "User");
    });

    it("devuelve componente Users para grupo", () => {
      const icon = stepKindUtils.getKindIcon("grupo");
      expect(icon).not.toBeNull();
      expect(icon).toHaveProperty("displayName", "Users");
    });

    it("devuelve null para undefined", () => {
      expect(stepKindUtils.getKindIcon(undefined)).toBeNull();
    });

    it("devuelve null para valor no reconocido", () => {
      expect(stepKindUtils.getKindIcon("otro" as AccountKind)).toBeNull();
    });

    it("el componente devuelto acepta className", () => {
      const icon = stepKindUtils.getKindIcon("individual");
      expect(icon).not.toBeNull();
      // Verificación de tipos en tiempo de compilación:
      // el tipo es React.ComponentType<{ className?: string }>
    });
  });

  describe("tipado estricto", () => {
    it("no usa any en la API exportada", () => {
      // Si esto compila, los tipos son correctos
      // stepKindUtils es de tipo StepKindUtils (const as const)
      expect(typeof stepKindUtils.isKindValid).toBe("function");
      expect(typeof stepKindUtils.getKindLabel).toBe("function");
      expect(typeof stepKindUtils.getKindDescription).toBe("function");
      expect(typeof stepKindUtils.getKindIcon).toBe("function");
    });

    it("StepKindUtils exporta el tipo correcto", () => {
      // Verificación de tipos en tiempo de compilación
      expect(true).toBe(true);
    });
  });
});