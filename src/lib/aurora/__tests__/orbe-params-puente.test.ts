import { beforeEach, describe, expect, it } from "vitest";
import { emitQuantumOrbParams, onQuantumOrbParams, quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import {
  conectarPuenteOrbeParams,
  montarCanalOrbeParams,
  mismoVectorOrbe,
  type CanalOrbeMin,
} from "../orbe-params-puente";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

const esperar = () => new Promise((r) => setTimeout(r, 5));

/** Canal falso: guarda lo publicado y deja inyectar anuncios como si vinieran de otra neurona. */
function canalFalso() {
  const publicados: Partial<QuantumOrbParams>[] = [];
  const oyentes = new Set<(a: { params: Partial<QuantumOrbParams>; at: number }) => void>();
  const canal: CanalOrbeMin & { inyectar(p: Partial<QuantumOrbParams>): void } = {
    async publicar(params) {
      publicados.push(params);
      return true;
    },
    suscribir(cb) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    inyectar(params) {
      for (const cb of Array.from(oyentes)) cb({ params, at: 1 });
    },
  };
  return { canal, publicados };
}

describe("orbe-params-puente — mismoVectorOrbe", () => {
  it("compara solo las cinco claves del vector", () => {
    const base: Partial<QuantumOrbParams> = { turbulence: 0.1, spikiness: 0.2, symmetry: 0.3, hueShift: 0.4, breath: 0.5 };
    expect(mismoVectorOrbe(base, { ...base })).toBe(true);
    expect(mismoVectorOrbe(base, { ...base, breath: 0.6 })).toBe(false);
    // Parciales: lo que no traen se compara con el valor por defecto, no con «ausente».
    expect(mismoVectorOrbe({ turbulence: 0.1 }, { turbulence: 0.1 })).toBe(true);
    expect(mismoVectorOrbe({ turbulence: 0.1 }, { turbulence: 0.2 })).toBe(false);
  });
});

describe("orbe-params-puente — conectarPuenteOrbeParams", () => {
  beforeEach(() => quantumOrbBus.clear("params"));

  it("publica en orb_params lo que emite el bus local", () => {
    const { canal, publicados } = canalFalso();
    const puente = conectarPuenteOrbeParams(canal);
    emitQuantumOrbParams({ turbulence: 0.4, breath: 0.9 });
    expect(publicados).toEqual([{ turbulence: 0.4, breath: 0.9 }]);
    puente.cerrar();
  });

  it("inyecta en el bus lo que llega del canal y NO lo re-publica (anti-eco)", () => {
    const { canal, publicados } = canalFalso();
    const recibidos: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((p) => recibidos.push(p));
    const puente = conectarPuenteOrbeParams(canal);
    canal.inyectar({ spikiness: 0.8 });
    expect(recibidos).toEqual([{ spikiness: 0.8 }]);
    expect(publicados).toEqual([]);
    unsub();
    puente.cerrar();
  });

  it("no repite el mismo vector dos veces seguidas", () => {
    const { canal, publicados } = canalFalso();
    const puente = conectarPuenteOrbeParams(canal);
    emitQuantumOrbParams({ hueShift: 0.5 });
    emitQuantumOrbParams({ hueShift: 0.5 });
    expect(publicados).toHaveLength(1);
    emitQuantumOrbParams({ hueShift: 0.7 });
    expect(publicados).toHaveLength(2);
    puente.cerrar();
  });

  it("al cerrar el puente, el bus ya no publica", () => {
    const { canal, publicados } = canalFalso();
    const puente = conectarPuenteOrbeParams(canal);
    puente.cerrar();
    emitQuantumOrbParams({ turbulence: 0.9 });
    expect(publicados).toEqual([]);
  });
});

describe("orbe-params-puente — montarCanalOrbeParams", () => {
  beforeEach(() => quantumOrbBus.clear("params"));

  it("sin cliente no monta nada y devuelve un desenganche inofensivo", async () => {
    const desmontar = montarCanalOrbeParams(null);
    emitQuantumOrbParams({ turbulence: 0.3 });
    await esperar();
    expect(() => desmontar()).not.toThrow();
  });
});