// @vitest-environment jsdom

import { describe, it, expect } from "vitest";

import { anotarVoto, leerVotos, CLAVE_VOTOS_VOZ, MAX_VOTOS_TOTAL, type DepsVotos, type VotoVoz } from "@/lib/aurora/votos-voz";

function bancoCon(agora: number): Banco {
  const datos = new Map<string, string>();
  let reloj = agora;
  let escrituraFalla = false;
  const deps: DepsVotos = {
    leer: (k) => datos.get(k) ?? null,
    escribir: (k, v) => {
      if (escrituraFalla) return false;
      datos.set(k, v);
      return true;
    },
    borrar: (k) => {
      datos.delete(k);
    },
    ahora: () => reloj,
    neurona: () => "n-prueba",
  };
  return {
    datos,
    deps,
    avanzar: (ms: number) => {
      reloj += ms;
    },
    fallarEscritura: () => {
      escrituraFalla = true;
    },
    guardadas: () => {
      const raw = datos.get(CLAVE_VOTOS_VOZ);
      if (!raw) return [];
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    },
  };
}

interface Banco {
  datos: Map<string, string>;
  deps: DepsVotos;
  avanzar: (ms: number) => void;
  fallarEscritura: () => void;
  guardadas: () => VotoVoz[];
}

const AHORA = 1_000_000;

const neuronaPrueba = () => "n-prueba";

describe("votos-voz", () => {
  it("anotarVoto guarda un 👍/👎 con la hora del reloj (in \"yectable)\", por motor", () => {
    const b = bancoCon(AHORA);
    expect(anotarVoto({ motor: "kokoro", voto: 1 }, b.deps)).toBe(true);
    expect(anotarVoto({ motor: "kokoro", voto: -1 }, b.deps)).toBe(true);
    expect(b.guardadas()).toEqual([
      { motor: "kokoro", voto: 1, timestamp: AHORA },
      { motor: "kokoro", voto: -1, timestamp: AHORA },
    ]);
    expect(leerVotos(b.deps)).toHaveLength(2);
  });

  it("el motor queda limpio y lo no votable no se guarda", () => {
    const b = bancoCon(AHORA);
    expect(anotarVoto({ motor: "  omnivoice  ", voto: -1 }, b.deps)).toBe(true);
    expect(b.guardadas()[0].motor).toBe("omnivoice");
    expect(anotarVoto({ motor: "   ", voto: 1 }, b.deps)).toBe(false);
    expect(anotarVoto({ motor: "kokoro", voto: 0 as 1 }, b.deps)).toBe(false);
    expect(b.guardadas()).toHaveLength(1);
  });

  it("leerVotos descarta lo ilegible y no lanza con el almacén roto", () => {
    const roto: DepsVotos = { leer: () => "{no es json", escribir: () => true, borrar: () => undefined, ahora: () => AHORA, neurona: neuronaPrueba };
    expect(leerVotos(roto)).toEqual([]);
    const lanzador: DepsVotos = { leer: () => { throw new Error("boom"); }, escribir: () => true, borrar: () => undefined, ahora: () => AHORA, neurona: neuronaPrueba };
    expect(leerVotos(lanzador)).toEqual([]);
    const mezcla: DepsVotos = {
      leer: () => JSON.stringify([
        { motor: "kokoro", voto: 1, timestamp: 10 },
        { motor: "kokoro", voto: 7, timestamp: 11 }, // voto imposible
        { motor: "kokoro", timestamp: 12 }, // sin voto
        { motor: "   ", voto: 1, timestamp: 13 }, // sin motor
        "x", null,
      ]),
      escribir: () => true,
      borrar: () => undefined,
      ahora: () => AHORA,
      neurona: neuronaPrueba,
    };
    expect(leerVotos(mezcla)).toEqual([{ motor: "kokoro", voto: 1, timestamp: 10 }]);
  });

  it("sin almacenamiento no se anota nada: la voz sigue igual", () => {
    const b = bancoCon(AHORA);
    expect(anotarVoto({ motor: "kokoro", voto: 1 }, { ...b.deps, escribir: () => false })).toBe(false);
    expect(b.guardadas()).toEqual([]);
  });

  it("el recorte deja solo los MAX_VOTOS_TOTAL más recientes", () => {
    let t = 0;
    const b = bancoCon(0);
    const deps = { ...b.deps, ahora: () => t++ };
    for (let i = 0; i < MAX_VOTOS_TOTAL + 5; i++) {
      anotarVoto({ motor: "kokoro", voto: i % 2 ? 1 : -1 }, deps);
    }
    const votos = leerVotos(deps);
    expect(votos).toHaveLength(MAX_VOTOS_TOTAL);
    expect(votos[0].timestamp).toBe(5); // los primeros 5 salieron
    expect(votos[votos.length - 1].timestamp).toBe(MAX_VOTOS_TOTAL + 4);
  });
});