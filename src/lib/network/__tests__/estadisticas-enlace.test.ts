import { describe, expect, it } from "vitest";

import { etiquetaRuta, resumirRuta } from "../estadisticas-enlace";

type Stat = Record<string, unknown>;

function informe(
  tipoLocal: string,
  tipoRemoto: string,
  extras: Stat = {},
): Stat[] {
  return [
    {
      id: "par",
      type: "candidate-pair",
      state: "succeeded",
      nominated: true,
      localCandidateId: "local",
      remoteCandidateId: "remoto",
      ...extras,
    },
    { id: "local", type: "local-candidate", candidateType: tipoLocal, protocol: "udp" },
    { id: "remoto", type: "remote-candidate", candidateType: tipoRemoto, protocol: "udp" },
  ];
}

describe("resumirRuta", () => {
  it("clasifica host/host y conserva las métricas reales", () => {
    const ruta = resumirRuta(
      informe("host", "host", {
        currentRoundTripTime: 0.0126,
        bytesSent: 120,
        bytesReceived: 340,
      }),
      1_000,
    );

    expect(ruta).toEqual({
      clase: "misma-red-local",
      tipoLocal: "host",
      tipoRemoto: "host",
      protocolo: "udp",
      rttMs: 13,
      bytesEnviados: 120,
      bytesRecibidos: 340,
      medidoEn: 1_000,
    });
  });

  it("clasifica srflx/host como internet directo", () => {
    expect(resumirRuta(informe("srflx", "host"), 2_000).clase).toBe("internet-directo");
  });

  it("prioriza relay como ruta TURN", () => {
    expect(resumirRuta(informe("host", "relay"), 3_000).clase).toBe("reenviado-turn");
  });

  it("devuelve una ruta desconocida sin par seleccionado", () => {
    expect(resumirRuta([{ id: "local", type: "local-candidate", candidateType: "host" }], 4_000)).toEqual({
      clase: "desconocida",
      tipoLocal: null,
      tipoRemoto: null,
      protocolo: null,
      rttMs: null,
      bytesEnviados: null,
      bytesRecibidos: null,
      medidoEn: 4_000,
    });
  });

  it("usa el par indicado por selectedCandidatePairId", () => {
    const elegida = informe("prflx", "host").map((stat) =>
      stat.id === "par" ? { ...stat, nominated: false } : stat,
    );
    const stats = new Map(elegida.map((stat) => [String(stat.id), stat]));
    stats.set("transporte", {
      id: "transporte",
      type: "transport",
      selectedCandidatePairId: "par",
    });

    expect(resumirRuta(stats, 5_000).clase).toBe("internet-directo");
  });
});

describe("etiquetaRuta", () => {
  it("devuelve las etiquetas en español", () => {
    expect(etiquetaRuta("misma-red-local")).toBe("misma red local");
    expect(etiquetaRuta("internet-directo")).toBe("internet directo (NAT)");
    expect(etiquetaRuta("reenviado-turn")).toBe("reenviado por servidor TURN");
    expect(etiquetaRuta("desconocida")).toBe("ruta desconocida");
  });
});

describe("resumirRuta con un RTCStatsReport de verdad (maplike, no instanceof Map)", () => {
  it("lee el par seleccionado aunque el informe no sea un Map", () => {
    const filas: Record<string, unknown>[] = [
      { id: "T1", type: "transport", selectedCandidatePairId: "CP1" },
      { id: "CP1", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "L1", remoteCandidateId: "R1", currentRoundTripTime: 0.004, bytesSent: 10, bytesReceived: 20 },
      { id: "L1", type: "local-candidate", candidateType: "host", protocol: "udp" },
      { id: "R1", type: "remote-candidate", candidateType: "host", protocol: "udp" },
    ];
    const mapa = new Map(filas.map((f) => [f.id as string, f]));
    // Imita RTCStatsReport: values/forEach/entries e iterador de pares, sin ser un Map.
    const informe = {
      values: () => mapa.values(),
      forEach: (cb: (v: unknown) => void) => mapa.forEach((v) => cb(v)),
      [Symbol.iterator]: () => mapa.entries(),
    };
    const r = resumirRuta(informe, 1);
    expect(r.clase).toBe("misma-red-local");
    expect(r.rttMs).toBe(4);
  });

  it("también acepta el iterador de pares [id, estadística]", () => {
    const pares: [string, Record<string, unknown>][] = [
      ["CP1", { id: "CP1", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "L1", remoteCandidateId: "R1" }],
      ["L1", { id: "L1", type: "local-candidate", candidateType: "srflx" }],
      ["R1", { id: "R1", type: "remote-candidate", candidateType: "host" }],
    ];
    expect(resumirRuta({ [Symbol.iterator]: () => pares[Symbol.iterator]() } as unknown as Iterable<Record<string, unknown>>, 1).clase).toBe("internet-directo");
  });
});
