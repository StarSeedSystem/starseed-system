// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { anotarMedida, medidasDe } from "@/lib/aurora/medidas-voz";

const DEV_NEURONA_ID = "dev-neurona-medidas-1015";

function getIdNeurona() {
  return DEV_NEURONA_ID;
}

describe("medidas-voz", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.clear();
    }
  });

  it("anotarMedida guarda una medida por neurona y tipo", () => {
    const neurona = getIdNeurona();
    anotarMedida({ neurona, motor: "Phonon-2", tipo: "primer-sonido", valor: 1200 });
    anotarMedida({ neurona, motor: "Parakeet", tipo: "tiempo-real-oido", valor: 0.85 });

    const medidas = medidasDe(neurona);
    expect(medidas).not.toBeNull();
    expect(medidas!.recientes).toBe(2);
  });

  it("medidasDe devuelve media móvil y p90 de las últimas 50 medidas", () => {
    const neurona = getIdNeurona();

    for (let i = 1; i <= 60; i++) {
      anotarMedida({ neurona, motor: `motor-${i % 5}`, tipo: "tiempo-real-voz", valor: i * 10 });
    }

    const m = medidasDe(neurona);
    expect(m).not.toBeNull();
    expect(m!.recientes).toBe(50);

    const esperados = Array.from({ length: 60 }, (_, i) => (i + 1) * 10);
    const normales = esperados.slice(-50);
    const mediaEsperada = normales.reduce((a, b) => a + b, 0) / normales.length;
    expect(Math.round(m!.mediaMovil * 100) / 100).toBe(Math.round(mediaEsperada * 100) / 100);

    const p90Esperado = normales.sort((a, b) => a - b)[Math.ceil(normales.length * 0.9) - 1];
    expect(Math.round(m!.p90 * 100) / 100).toBe(Math.round(p90Esperado * 100) / 100);
  });

  it("medidasDe filtra otras neuronas", () => {
    const neuronaA = "neurona-A";
    const neuronaB = "neurona-B";

    anotarMedida({ neurona: neuronaA, motor: "m1", tipo: "correccion", valor: 1.0 });
    anotarMedida({ neurona: neuronaB, motor: "m2", tipo: "correccion", valor: 2.0 });

    expect(medidasDe(neuronaA)!.recientes).toBe(1);
    expect(medidasDe(neuronaB)!.recientes).toBe(1);
    expect(medidasDe(neuronaA)!.mediaMovil).toBe(1.0);
    expect(medidasDe(neuronaB)!.mediaMovil).toBe(2.0);
  });

  it("medidasDe devuelve null si no hay medidas", () => {
    expect(medidasDe(DEV_NEURONA_ID)).toBeNull();
  });
});
