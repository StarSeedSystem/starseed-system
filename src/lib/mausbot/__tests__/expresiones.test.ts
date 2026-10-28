import { describe, it, expect } from "vitest";
import type { QuantumOrbVoiceState } from "@/lib/aurora/quantum-orb-bus";
import {
  BOCAS,
  EXPRESIONES,
  EXPRESION_COUNT,
  FACE_BOX,
  FACE_CENTRE,
  GAZE_TRAVEL,
  expresionDe,
  estadoDesdeOrbe,
  type EstadoMausbot,
} from "../expresiones";

const ESTADOS: readonly EstadoMausbot[] = [
  "sleeping", "waking", "idle", "listening", "thinking", "searching",
  "working", "excited", "surprised", "suspicious", "angry", "drowsy",
  "happy", "curious", "confused", "bored", "proud", "shy",
];

const INDICE_ESPERADO: readonly (readonly [EstadoMausbot, number])[] = [
  ["sleeping", 22], ["waking", 13], ["idle", 6], ["listening", 1], ["thinking", 17], ["searching", 20],
  ["working", 10], ["excited", 2], ["surprised", 21], ["suspicious", 5], ["angry", 7], ["drowsy", 22],
  ["happy", 19], ["curious", 21], ["confused", 8], ["bored", 0], ["proud", 2], ["shy", 24],
];

const ORBE_ESPERADO: readonly (readonly [QuantumOrbVoiceState, EstadoMausbot])[] = [
  ["idle", "idle"], ["listening", "listening"], ["user_speaking", "listening"],
  ["thinking", "thinking"], ["speaking", "happy"], ["error", "confused"],
];

const esPuntoValido = (p: readonly [number, number]) =>
  Number.isFinite(p[0]) && Number.isFinite(p[1]);

describe("expresiones del Mausbot", () => {
  it("trae las 25 expresiones, cada una con 2 ojos de 48 puntos", () => {
    expect(EXPRESION_COUNT).toBe(25);
    expect(EXPRESIONES).toHaveLength(25);
    for (const expresion of EXPRESIONES) {
      expect(expresion).toHaveLength(2);
      for (const ojo of expresion) {
        expect(ojo).toHaveLength(48);
        expect(ojo.every(esPuntoValido)).toBe(true);
      }
    }
  });

  it("trae una boca por expresión con sus cuatro parámetros", () => {
    expect(BOCAS).toHaveLength(25);
    for (const boca of BOCAS) {
      expect(boca).toHaveLength(4);
      expect(boca.every(Number.isFinite)).toBe(true);
    }
  });

  it("publica la caja y el centro de la cara y el recorrido de la mirada", () => {
    expect(FACE_BOX).toBeGreaterThan(0);
    expect(FACE_CENTRE).toEqual([120, 122.5]);
    expect(GAZE_TRAVEL).toEqual({ x: 13.2, y: 8.4 });
  });

  it("cubre los 18 estados del Mausbot", () => {
    expect(ESTADOS).toHaveLength(18);
    expect(new Set(ESTADOS).size).toBe(18);
  });

  it("asigna a cada estado su expresión canónica", () => {
    expect(INDICE_ESPERADO).toHaveLength(18);
    for (const [estado, indice] of INDICE_ESPERADO) {
      const expresion = expresionDe(estado);
      expect(EXPRESIONES.indexOf(expresion)).toBe(indice);
      expect(expresion).toHaveLength(2);
      expect(expresion[0]).toHaveLength(48);
      expect(expresion[1]).toHaveLength(48);
    }
  });
});

describe("estadoDesdeOrbe", () => {
  it("sigue la tabla del contrato §3", () => {
    expect(ORBE_ESPERADO).toHaveLength(6);
    for (const [voz, estado] of ORBE_ESPERADO) {
      expect(estadoDesdeOrbe(voz)).toBe(estado);
    }
  });

  it("devuelve siempre un estado conocido", () => {
    for (const [voz] of ORBE_ESPERADO) {
      expect(ESTADOS).toContain(estadoDesdeOrbe(voz));
    }
  });
});
