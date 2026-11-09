import { beforeEach, describe, expect, it } from "vitest";
import { quantumOrbBus, onQuantumOrbParams, emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

describe("quantum-orb-bus — canal params", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
  });

  it("emite y recibe el vector visual completo (turbulence, spikiness, symmetry, hueShift, breath)", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((params) => received.push(params));

    const vector: Partial<QuantumOrbParams> = {
      turbulence: 0.7,
      spikiness: 0.3,
      symmetry: 0.8,
      hueShift: 0.2,
      breath: 0.6,
    };
    emitQuantumOrbParams(vector);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject(vector);

    unsub();
  });

  it("recibe actualizaciones parciales del vector (solo algunos parámetros)", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((params) => received.push(params));

    emitQuantumOrbParams({ turbulence: 0.5 });
    emitQuantumOrbParams({ spikiness: 0.9 });
    emitQuantumOrbParams({ symmetry: 0.1, hueShift: 0.4 });

    expect(received).toHaveLength(3);
    expect(received[0]).toEqual({ turbulence: 0.5 });
    expect(received[1]).toEqual({ spikiness: 0.9 });
    expect(received[2]).toMatchObject({ symmetry: 0.1, hueShift: 0.4 });

    unsub();
  });

  it("múltiples suscriptores reciben la misma emisión", () => {
    const r1: Partial<QuantumOrbParams>[] = [];
    const r2: Partial<QuantumOrbParams>[] = [];
    const unsub1 = onQuantumOrbParams((p) => r1.push(p));
    const unsub2 = onQuantumOrbParams((p) => r2.push(p));

    emitQuantumOrbParams({ breath: 0.5, turbulence: 0.2 });

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(r1[0]).toMatchObject({ breath: 0.5, turbulence: 0.2 });
    expect(r2[0]).toMatchObject({ breath: 0.5, turbulence: 0.2 });

    unsub1();
    unsub2();
  });

  it("desuscribirse deja de recibir emisiones", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => received.push(p));

    emitQuantumOrbParams({ turbulence: 0.1 });
    unsub();
    emitQuantumOrbParams({ turbulence: 0.9 });

    expect(received).toHaveLength(1);
    expect(received[0].turbulence).toBe(0.1);
  });

  it("clear(params) elimina todos los suscriptores del canal", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    onQuantumOrbParams((p) => received.push(p));

    emitQuantumOrbParams({ turbulence: 0.5 });
    quantumOrbBus.clear("params");
    emitQuantumOrbParams({ turbulence: 0.8 });

    expect(received).toHaveLength(1);
    expect(received[0].turbulence).toBe(0.5);
  });

  it("los parámetros se recortan a 0..1 en el tema, no en el bus (el bus es passthrough)", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    onQuantumOrbParams((p) => received.push(p));

    emitQuantumOrbParams({ turbulence: 1.5, spikiness: -0.3, symmetry: 0.5 });

    expect(received[0]).toMatchObject({ turbulence: 1.5, spikiness: -0.3, symmetry: 0.5 });
  });

  it("emisión sin suscriptores no lanza", () => {
    expect(() => emitQuantumOrbParams({ turbulence: 0.5 })).not.toThrow();
  });
});