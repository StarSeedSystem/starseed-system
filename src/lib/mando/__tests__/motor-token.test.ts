import { describe, it, expect } from "vitest";
import {
  crearTokenMotor,
  hashToken,
  formatoTokenValido,
  verificarToken,
  CAPACIDADES_MOTOR,
  capacidadesMotorValidas,
} from "../motor-token";

describe("motor-token", () => {
  describe("crearTokenMotor", () => {
    it("genera token, hash y huella", () => {
      const { token, hash, huella } = crearTokenMotor();
      expect(token).toMatch(/^ssm_[A-Za-z0-9_-]{43}$/);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(huella).toBe(hash.slice(0, 8));
    });

    it("token no es el hash ni lo contiene", () => {
      const { token, hash } = crearTokenMotor();
      expect(token).not.toBe(hash);
      expect(hash).not.toContain(token);
      expect(token).not.toContain(hash);
    });

    it("produce tokens distintos en cada llamada", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { token } = crearTokenMotor();
        tokens.add(token);
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("hashToken", () => {
    it("devuelve sha256 hex del token", () => {
      const token = "ssm_" + "A".repeat(43);
      const hash = hashToken(token);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("formatoTokenValido", () => {
    it("acepta token válido", () => {
      const { token } = crearTokenMotor();
      expect(formatoTokenValido(token)).toBe(true);
    });

    it("rechaza formato incorrecto", () => {
      expect(formatoTokenValido("ssm_invalido")).toBe(false);
      expect(formatoTokenValido("invalid_prefix_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")).toBe(false);
      expect(formatoTokenValido(undefined as unknown)).toBe(false);
      expect(formatoTokenValido(null as unknown)).toBe(false);
      expect(formatoTokenValido(123 as unknown)).toBe(false);
    });
  });

  describe("verificarToken", () => {
    it("true cuando token y hash coinciden", () => {
      const { token, hash } = crearTokenMotor();
      expect(verificarToken(token, hash)).toBe(true);
    });

    it("false cuando hash no coincide", () => {
      const { token } = crearTokenMotor();
      const otro = "ssm_" + "B".repeat(43);
      expect(verificarToken(token, hashToken(otro))).toBe(false);
    });

    it("false y sin excepción con formato malo o undefined", () => {
      expect(verificarToken("no-es-token", "hash")).toBe(false);
      expect(verificarToken(undefined as unknown, "hash")).toBe(false);
      expect(verificarToken("ssm_" + "A".repeat(43), undefined as unknown)).toBe(false);
      expect(verificarToken(null as unknown, null as unknown)).toBe(false);
    });
  });

  describe("capacidadesMotorValidas", () => {
    it("ok true y invalidas vacío para capacidades válidas", () => {
      const res = capacidadesMotorValidas(["reportar", "medidores"]);
      expect(res.ok).toBe(true);
      expect(res.invalidas).toEqual([]);
    });

    it("detecta capacidades inválidas", () => {
      const res = capacidadesMotorValidas(["reportar", "inexistente", "chat-motor"]);
      expect(res.ok).toBe(false);
      expect(res.invalidas).toContain("inexistente");
    });

    it("no array → ok false", () => {
      expect(capacidadesMotorValidas("reportar").ok).toBe(false);
      expect(capacidadesMotorValidas(null as unknown).ok).toBe(false);
      expect(capacidadesMotorValidas(undefined as unknown).ok).toBe(false);
    });
  });
});