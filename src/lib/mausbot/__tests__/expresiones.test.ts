import { describe, expect, it } from "vitest";
import {
  BOCAS, CAJA_CARA, CENTRO_CARA, EXPRESIONES, MIRADAS, POSESIONES, RECORRIDO_MIRADA,
  TOTAL_EXPRESIONES, TRAZO_BOCAS, estadoDesdeOrbe, expresionDe, marcoBoca,
  type EstadoMausbot,
} from "@/lib/mausbot/expresiones";
import type { QuantumOrbVoiceState } from "@/lib/aurora/quantum-orb-bus";

const ESTADOS: EstadoMausbot[] = [
  "sleeping", "waking", "idle", "listening", "thinking", "searching", "working",
  "excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious",
  "confused", "bored", "proud", "shy",
];

describe("expresiones del Mausbot (port de OpenMausBot)", () => {
  it("tiene 25 expresiones, cada una con 2 ojos de 48 puntos finitos", () => {
    expect(EXPRESIONES).toHaveLength(25);
    expect(TOTAL_EXPRESIONES).toBe(25);
    for (const ex of EXPRESIONES) {
      expect(ex).toHaveLength(2);
      for (const ojo of ex) {
        expect(ojo).toHaveLength(48);
        for (const [x, y] of ojo) {
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        }
      }
    }
  });

  it("descontó la mirada centro por centro de la cara, no del ojo", () => {
    expect(MIRADAS).toHaveLength(25);
    expect(CENTRO_CARA[0]).toBeLessThan(CAJA_CARA);
    expect(CENTRO_CARA[1]).toBeLessThan(CAJA_CARA);
    expect(RECORRIDO_MIRADA.x).toBeGreaterThan(0);
    // la mirada de cada expresión cabe dentro de la caja de la cara
    for (const [mx, my] of MIRADAS) {
      expect(Math.abs(mx)).toBeLessThan(CAJA_CARA);
      expect(Math.abs(my)).toBeLessThan(CAJA_CARA);
    }
  });

  it("empareja 25 bocas con las 25 expresiones y las ancla dentro de la caja", () => {
    expect(BOCAS).toHaveLength(EXPRESIONES.length);
    for (const espec of BOCAS) {
      expect(espec).toHaveLength(4);
      for (const n of espec) expect(Number.isFinite(n)).toBe(true);
    }
    BOCAS.forEach((espec, i) => {
      const ancho = espec[0];
      expect(ancho).toBeGreaterThan(0);
      expect(TRAZO_BOCAS).toBeGreaterThan(0);
      const m = marcoBoca(EXPRESIONES[i], espec);
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.y)).toBe(true);
      expect(Number.isFinite(m.angulo)).toBe(true);
      expect(m.x).toBeGreaterThan(-CAJA_CARA);
      expect(m.x).toBeLessThan(CAJA_CARA * 2);
      expect(m.y).toBeGreaterThan(0);
      expect(m.y).toBeLessThan(CAJA_CARA);
    });
  });
});

describe("contrato del port (OpenMausBot)", () => {
  it("publica la caja y el centro de la cara y el recorrido exacto de la mirada", () => {
    expect(CAJA_CARA).toBeGreaterThan(0);
    expect(CENTRO_CARA).toEqual([120, 122.5]);
    expect(RECORRIDO_MIRADA).toEqual({ x: 13.2, y: 8.4 });
  });

  it("cubre los 18 estados y asigna a cada uno su expresión canónica", () => {
    const estadosTabla = Object.keys(POSESIONES) as EstadoMausbot[];
    expect(estadosTabla).toHaveLength(18);
    expect(new Set(estadosTabla).size).toBe(18);
    const canonicas: Record<EstadoMausbot, number> = {
      sleeping: 22, waking: 13, idle: 6, listening: 1, thinking: 17,
      searching: 20, working: 10, excited: 2, surprised: 21, suspicious: 5,
      angry: 7, drowsy: 22, happy: 19, curious: 21, confused: 8,
      bored: 0, proud: 2, shy: 24,
    };
    for (const [estado, primera] of Object.entries(canonicas) as [EstadoMausbot, number][]) {
      expect(expresionDe(estado)[0]).toBe(primera);
      expect(POSESIONES[estado][0]).toBe(primera);
    }
  });
});

describe("tabla estado → expresión", () => {
  it("expresionDe devuelve índices válidos para los 18 estados", () => {
    expect(ESTADOS.map(e => POSESIONES[e]).every(Boolean)).toBe(true);
    for (const estado of ESTADOS) {
      const indices = expresionDe(estado);
      expect(indices.length).toBeGreaterThan(0);
      for (const i of indices) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of indices) expect(i).toBeLessThan(TOTAL_EXPRESIONES);
    }
  });

  it("traduce la voz de la orbe cuántica según el contrato §3", () => {
    const tabla: Record<QuantumOrbVoiceState, EstadoMausbot> = {
      idle: "idle",
      listening: "listening",
      user_speaking: "listening",
      thinking: "thinking",
      speaking: "happy",
      error: "confused",
    };
    const estadosOrbe = Object.keys(tabla) as QuantumOrbVoiceState[];
    expect(estadoDesdeOrbe("user_speaking")).toBe("listening");
    expect(estadoDesdeOrbe("speaking")).toBe("happy");
    expect(estadoDesdeOrbe("error")).toBe("confused");
    for (const voz of estadosOrbe) expect(estadoDesdeOrbe(voz)).toBe(tabla[voz]);
  });
});
