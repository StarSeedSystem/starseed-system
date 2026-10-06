/**
 * Pruebas del cableado del radar (Ola 1006R · RDV14). Solo la función PURA
 * exportada por el hook: la ordenación de la lista COMBINADA de señales
 * (locales + radio nativa + lo que oyen otras neuronas). Sin red, sin disco,
 * sin DOM. El resto del hook es pegamento de React con fuentes ya probadas
 * en sus propios módulos (radar-por-malla, senales-radio-local, radar-fusion).
 */
import { describe, expect, it } from "vitest";
import { ordenarSenalesPorCalidad } from "@/components/mesh/use-detected-signals";
import type { AntennaKind, DetectedSignal } from "@/ai/astraura/mesh/signals";

/** Señal mínima válida, como la que producen las fuentes reales. */
function senal(id: string, quality: number | null, antenna: AntennaKind = "lora"): DetectedSignal {
  return {
    id,
    antenna,
    antennaLabel: antenna,
    signalType: "prueba",
    label: "prueba",
    detail: "prueba",
    quality,
    qualityDetail: "prueba",
    metrics: [],
    compatible: true,
    compatDetail: "prueba",
    starseed: null,
    placement: {
      angleRad: 0,
      radiusFrac: 0.5,
      accuracyFrac: 0.2,
      mode: "sector",
      distanceM: null,
      accuracyM: null,
      detail: "prueba",
    },
    lastHeard: null,
    actions: [],
    simulated: false,
    color: "#fff",
  };
}

describe("ordenarSenalesPorCalidad", () => {
  it("ordena como collectDetectedSignals: mejor calidad primero y sin calidad al final", () => {
    const lista = [
      senal("a-media", 0.5),
      senal("b-sin-calidad", null),
      senal("c-alta", 0.9),
      senal("d-baja", 0.1),
    ];
    expect(ordenarSenalesPorCalidad(lista).map((s) => s.id)).toEqual([
      "c-alta", "a-media", "d-baja", "b-sin-calidad",
    ]);
  });

  it("a igual calidad desempata por id (determinista, sin Math.random)", () => {
    const lista = [senal("zeta", 0.5), senal("alfa", 0.5), senal("media", 0.5)];
    expect(ordenarSenalesPorCalidad(lista).map((s) => s.id)).toEqual([
      "alfa", "media", "zeta",
    ]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [senal("zeta", 0.1), senal("alfa", 0.9)];
    ordenarSenalesPorCalidad(lista);
    expect(lista.map((s) => s.id)).toEqual(["zeta", "alfa"]);
  });

  it("mezcla lo que oyen otras neuronas (id remoto:…) con las locales por calidad", () => {
    const lista = [
      senal("remoto:n1:lora:7", 0.4, "lora"),
      senal("lora:3", 0.8, "lora"),
      senal("wifi:abc", null, "ip"),
    ];
    expect(ordenarSenalesPorCalidad(lista).map((s) => s.id)).toEqual([
      "lora:3", "remoto:n1:lora:7", "wifi:abc",
    ]);
  });
});
