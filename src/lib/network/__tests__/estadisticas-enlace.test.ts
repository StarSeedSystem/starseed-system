import { describe, expect, it } from "vitest";

import { clasificarPar, etiquetaRuta, mismaSubred, resumirRuta, tipoDireccion } from "../estadisticas-enlace";

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

  it("cae al par nominado si selectedCandidatePairId no existe en el informe", () => {
    const stats = [
      ...informe("srflx", "host"),
      { id: "transporte", type: "transport", selectedCandidatePairId: "no-existe" },
    ];

    expect(resumirRuta(stats, 6_000).clase).toBe("internet-directo");
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

    expect(resumirRuta(stats, 7_000).clase).toBe("misma-red-local");
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

    expect(resumirRuta(stats, 8_000).clase).toBe("desconocida");
  });
});

describe("etiquetaRuta", () => {
  it("devuelve las etiquetas en español", () => {
    expect(etiquetaRuta("misma-red-local")).toBe("misma red local");
    expect(etiquetaRuta("internet-directo")).toBe("internet directo (NAT atravesado)");
    expect(etiquetaRuta("reenviado-turn")).toBe("relé TURN");
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


/* (BLE1108B) El 08-11 la tableta decía «P2P por internet (NAT atravesado)» y la Mac «red local» para la misma transferencia. */
function informeConDirecciones(tipoLocal: string, dirLocal: string | null, tipoRemoto: string, dirRemota: string | null): Stat[] {
  return [
    { id: "par", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "l", remoteCandidateId: "r" },
    { id: "l", type: "local-candidate", candidateType: tipoLocal, protocol: "udp", ...(dirLocal ? { address: dirLocal } : {}) },
    { id: "r", type: "remote-candidate", candidateType: tipoRemoto, protocol: "udp", ...(dirRemota ? { ip: dirRemota } : {}) },
  ];
}
const clase = (a: Stat[]) => resumirRuta(a, 1).clase;

describe("clasificador común de la ruta (par de candidatos y direcciones)", () => {
  it("host↔host en la misma LAN, y host↔host con nombres mDNS (sin direcciones), es red local", () => {
    expect(clase(informeConDirecciones("host", "192.168.1.30", "host", "192.168.1.20"))).toBe("misma-red-local");
    expect(clase(informeConDirecciones("host", null, "host", null))).toBe("misma-red-local");
  });

  it("srflx/prflx con direcciones privadas de la misma LAN: red local aunque la señalización fuese por internet", () => {
    expect(clase(informeConDirecciones("srflx", "192.168.1.20", "host", "192.168.1.30"))).toBe("misma-red-local");
    expect(clase(informeConDirecciones("host", "192.168.1.30", "prflx", "192.168.1.20"))).toBe("misma-red-local");
    expect(clase(informeConDirecciones("prflx", "10.0.4.7", "prflx", "10.0.9.2"))).toBe("misma-red-local"); // 10/8: mismo /16
    expect(clase(informeConDirecciones("prflx", "fd12:3456:789a:1::5", "host", "fd12:3456:789a:1::9"))).toBe("misma-red-local"); // ULA
    expect(clase(informeConDirecciones("host", "169.254.3.4", "host", "169.254.9.9"))).toBe("misma-red-local"); // enlace local
  });

  it("público↔público, o srflx entre redes distintas, es internet directo (NAT atravesado)", () => {
    expect(clase(informeConDirecciones("srflx", "203.0.113.5", "srflx", "198.51.100.8"))).toBe("internet-directo");
    expect(clase(informeConDirecciones("srflx", "203.0.113.5", "host", "192.168.1.30"))).toBe("internet-directo");
    expect(clase(informeConDirecciones("prflx", "192.168.1.20", "srflx", "198.51.100.8"))).toBe("internet-directo");
    expect(clase(informeConDirecciones("srflx", "192.168.1.20", "prflx", "172.20.0.9"))).toBe("internet-directo"); // dos LAN distintas
  });

  it("el relé TURN gana siempre, con cualquier dirección", () => {
    expect(clase(informeConDirecciones("relay", "203.0.113.9", "host", "192.168.1.30"))).toBe("reenviado-turn");
    expect(clase(informeConDirecciones("host", "192.168.1.30", "relay", "192.168.1.31"))).toBe("reenviado-turn");
  });

  it("los dos lados miden la MISMA clase aunque vean tipos de candidato distintos", () => {
    const tableta = clase(informeConDirecciones("srflx", "192.168.1.20", "host", "192.168.1.30"));
    const mac = clase(informeConDirecciones("host", "192.168.1.30", "prflx", "192.168.1.20"));
    expect(tableta).toBe(mac);
    expect(etiquetaRuta(tableta)).toBe("misma red local");
  });

  it("direcciones: privadas, CGNAT (no es privada), públicas y subredes", () => {
    expect(["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.9", "fd00::1", "fe80::1%wlan0"].map(tipoDireccion)).toEqual(["privada", "privada", "privada", "privada", "privada", "enlace-local"]);
    expect(tipoDireccion("172.32.0.1")).toBe("publica");
    expect(tipoDireccion("100.64.1.1")).toBe("publica");
    expect(tipoDireccion("2001:db8::1")).toBe("publica");
    expect(tipoDireccion(null)).toBe("desconocida");
    expect(mismaSubred("192.168.1.20", "192.168.1.30")).toBe(true);
    expect(mismaSubred("192.168.1.20", "192.168.2.30")).toBe(false);
    expect(mismaSubred("192.168.1.20", "10.0.0.1")).toBe(false);
  });

  it("sin dirección ni host↔host, se queda en el tipo de candidato como antes", () => {
    expect(clasificarPar({ tipoLocal: "srflx", tipoRemoto: "host" })).toBe("internet-directo");
    expect(clasificarPar({ tipoLocal: null, tipoRemoto: null })).toBe("desconocida");
  });
});
