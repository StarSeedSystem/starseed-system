import { describe, expect, it } from "vitest";

import { resumenIce, TipoCandidatoIce } from "../estadisticas-ice";

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

function informeConTransporte(
  tipoLocal: string,
  tipoRemoto: string,
  selectedPairId: string,
  extras: Stat = {},
): Stat[] {
  return [
    {
      id: "transporte",
      type: "transport",
      selectedCandidatePairId: selectedPairId,
    },
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

describe("resumenIce", () => {
  it("devuelve host/host con métricas reales", () => {
    const res = resumenIce(
      informe("host", "host", {
        currentRoundTripTime: 0.0126,
        bytesSent: 120,
        bytesReceived: 340,
      }),
      1_000,
    );

    expect(res).toEqual({
      parElegido: "par",
      tipoLocal: "host",
      tipoRemoto: "host",
      clasificacion: "host-host",
      rttMs: 13,
      bytesEnviados: 120,
      bytesRecibidos: 340,
      medidoEn: 1_000,
    });
  });

  it("devuelve srflx/host como srflx-host", () => {
    const res = resumenIce(informe("srflx", "host"), 2_000);
    expect(res.clasificacion).toBe("srflx-host");
    expect(res.tipoLocal).toBe("srflx");
    expect(res.tipoRemoto).toBe("host");
  });

  it("devuelve relay como relay cuando hay relay", () => {
    const res = resumenIce(informe("host", "relay"), 3_000);
    expect(res.clasificacion).toBe("host-relay");
    expect(res.tipoLocal).toBe("host");
    expect(res.tipoRemoto).toBe("relay");
  });

  it("devuelve desconocida sin par seleccionado", () => {
    const res = resumenIce(
      [{ id: "local", type: "local-candidate", candidateType: "host" }],
      4_000,
    );
    expect(res.clasificacion).toBe("desconocida");
    expect(res.tipoLocal).toBeNull();
    expect(res.tipoRemoto).toBeNull();
    expect(res.rttMs).toBeNull();
    expect(res.bytesEnviados).toBeNull();
    expect(res.bytesRecibidos).toBeNull();
  });

  it("usa el par indicado por selectedCandidatePairId", () => {
    const elegida = informeConTransporte("prflx", "host", "par", {
      currentRoundTripTime: 0.005,
      bytesSent: 50,
      bytesReceived: 80,
    });
    const res = resumenIce(elegida, 5_000);
    expect(res.clasificacion).toBe("prflx-host");
    expect(res.rttMs).toBe(5);
  });

  it("cae al par nominado si selectedCandidatePairId no existe en el informe", () => {
    const stats = [
      ...informe("srflx", "host"),
      { id: "transporte", type: "transport", selectedCandidatePairId: "no-existe" },
    ];
    const res = resumenIce(stats, 6_000);
    expect(res.clasificacion).toBe("srflx-host");
  });

  it("cae al par nominado si el par seleccionado aún no está en succeeded", () => {
    const base = informe("host", "host");
    const pendiente = {
      id: "par-pendiente",
      type: "candidate-pair",
      state: "in-progress",
      nominated: false,
      localCandidateId: "local",
      remoteCandidateId: "remoto",
    };
    const stats = [
      ...base,
      pendiente,
      { id: "transporte", type: "transport", selectedCandidatePairId: "par-pendiente" },
    ];
    const res = resumenIce(stats, 7_000);
    expect(res.clasificacion).toBe("host-host");
  });

  it("devuelve desconocida si el par seleccionado no sirve y no hay nominado", () => {
    const stats = [
      {
        id: "par-pendiente",
        type: "candidate-pair",
        state: "in-progress",
        localCandidateId: "local",
        remoteCandidateId: "remoto",
      },
      { id: "local", type: "local-candidate", candidateType: "host" },
      { id: "remoto", type: "remote-candidate", candidateType: "host" },
      { id: "transporte", type: "transport", selectedCandidatePairId: "par-pendiente" },
    ];
    const res = resumenIce(stats, 8_000);
    expect(res.clasificacion).toBe("desconocida");
  });

  it("acepta un RTCStatsReport maplike (no instanceof Map)", () => {
    const filas: Record<string, unknown>[] = [
      { id: "T1", type: "transport", selectedCandidatePairId: "CP1" },
      {
        id: "CP1",
        type: "candidate-pair",
        state: "succeeded",
        nominated: true,
        localCandidateId: "L1",
        remoteCandidateId: "R1",
        currentRoundTripTime: 0.004,
        bytesSent: 10,
        bytesReceived: 20,
      },
      { id: "L1", type: "local-candidate", candidateType: "host", protocol: "udp" },
      { id: "R1", type: "remote-candidate", candidateType: "srflx", protocol: "udp" },
    ];
    const mapa = new Map(filas.map((f) => [f.id as string, f]));
    const informeMaplike = {
      values: () => mapa.values(),
      forEach: (cb: (v: unknown) => void) => mapa.forEach((v) => cb(v)),
      [Symbol.iterator]: () => mapa.entries(),
    };
    const res = resumenIce(informeMaplike, 1);
    expect(res.clasificacion).toBe("host-srflx");
    expect(res.rttMs).toBe(4);
  });

  it("también acepta el iterador de pares [id, estadística]", () => {
    const pares: [string, Record<string, unknown>][] = [
      [
        "CP1",
        { id: "CP1", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "L1", remoteCandidateId: "R1" },
      ],
      ["L1", { id: "L1", type: "local-candidate", candidateType: "srflx" }],
      ["R1", { id: "R1", type: "remote-candidate", candidateType: "host" }],
    ];
    const res = resumenIce({ [Symbol.iterator]: () => pares[Symbol.iterator]() } as unknown as Iterable<Record<string, unknown>>, 1);
    expect(res.clasificacion).toBe("srflx-host");
  });
});

describe("TipoCandidatoIce", () => {
  it("exporta los tipos válidos", () => {
    const tipos: TipoCandidatoIce[] = ["host", "srflx", "prflx", "relay", "desconocido"];
    expect(tipos).toHaveLength(5);
  });
});