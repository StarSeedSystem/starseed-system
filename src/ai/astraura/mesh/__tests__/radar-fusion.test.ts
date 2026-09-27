import { describe, expect, it } from "vitest";
import { fusionarRadar, nombreLimpio } from "../radar-fusion";
import type { AntennaKind, DetectedSignal, StarseedIdentity } from "../signals";

function identidad(
  sourceId: string,
  extra: Partial<StarseedIdentity> = {},
): StarseedIdentity {
  return {
    via: "neuron-registry",
    sourceId,
    name: "Neurona",
    ownAccount: true,
    capabilities: [],
    ...extra,
  };
}

function senal(
  id: string,
  antenna: AntennaKind,
  starseed: StarseedIdentity,
  extra: Partial<DetectedSignal> = {},
): DetectedSignal {
  return {
    id,
    antenna,
    antennaLabel: antenna,
    signalType: "prueba",
    label: "Neurona",
    detail: "prueba",
    quality: 0.2,
    qualityDetail: "prueba",
    metrics: [],
    compatible: true,
    compatDetail: "prueba",
    starseed,
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
    ...extra,
  };
}

describe("fusionarRadar", () => {
  const ahora = 1_000_000;
  it("funde el faro propio con su neurona sin mutar la entrada", () => {
    const cuenta = senal("neuron:n-1", "account", identidad("n-1"));
    const faro = senal("beacon:b-1", "relay", identidad("b-1", {
      via: "relay-beacon", neuronId: "n-1", onlineCount: 3,
    }), {
      lastHeard: ahora - 1_000,
      metrics: [{ label: "Último faro", value: "hace 1 s" }],
    });

    const resultado = fusionarRadar([faro, cuenta], ahora);

    expect(resultado.map((item) => item.id)).toEqual(["neuron:n-1"]);
    expect(resultado[0].metrics).toEqual(expect.arrayContaining([
      { label: "Faro en el relé", value: "hace 1 s" },
      { label: "Nodos LoRa que ve", value: "3" },
    ]));
    expect(resultado[0].starseed?.capabilities).toContain("faro en el relé");
    expect(cuenta.metrics).toEqual([]);
  });

  it("conserva faros sin neuronId o pertenecientes a otra cuenta", () => {
    const sinId = senal("beacon:sin-id", "relay", identidad("b-1", {
      via: "relay-beacon",
    }));
    const ajeno = senal("beacon:ajeno", "relay", identidad("b-2", {
      via: "relay-beacon", neuronId: "n-1", ownAccount: false,
    }));
    const cuenta = senal("neuron:n-1", "account", identidad("n-1"));

    expect(fusionarRadar([sinId, ajeno, cuenta], ahora).map((item) => item.id))
      .toEqual(["beacon:sin-id", "beacon:ajeno", "neuron:n-1"]);
  });

  it("reanima una neurona desconectada cuando su faro es reciente", () => {
    const cuenta = senal("neuron:n-1", "account", identidad("n-1", { online: false }), {
      quality: 0.1, metrics: [{ label: "Estado", value: "desconectada" }],
    });
    const faro = senal("beacon:b-1", "relay", identidad("b-1", {
      via: "relay-beacon", neuronId: "n-1",
    }), { quality: 0.9, lastHeard: ahora - 299_999 });
    const [resultado] = fusionarRadar([cuenta, faro], ahora);

    expect(resultado.starseed?.online).toBe(true);
    expect(resultado.quality).toBe(0.9);
    expect(resultado.metrics).toContainEqual({ label: "Estado", value: "en línea (por su faro)" });
  });

  it("quita el pictograma inicial de etiqueta y nombre StarSeed", () => {
    const cuenta = senal("neuron:n-1", "account", identidad("n-1", {
      name: "💻 macOS · Chrome 152",
    }), { label: "💻 macOS · Chrome 152" });
    const [resultado] = fusionarRadar([cuenta], ahora);

    expect(resultado.label).toBe("macOS · Chrome 152");
    expect(resultado.starseed?.name).toBe("macOS · Chrome 152");
  });

  it("conserva un nombre compuesto solo por emoji", () => {
    expect(nombreLimpio("  💻  ")).toBe("💻");
  });
});
