import { describe, expect, it } from "vitest";
import { collectDetectedSignals, type DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { MeshState } from "@/ai/astraura/mesh/types";
import {
  agruparYOrdenarSenales,
  clasificarCategoriaSenal,
  extraerAntenasIndependientes,
} from "../categorizacion-antenas";

const meshVacio: MeshState = {
  status: "disconnected",
  transport: null,
  self: null,
  nodes: [],
  messages: [],
  region: "US",
  preset: "LONG_FAST",
  remoteTopologies: [],
};

describe("señales multiantena y aparatos hermanos no colapsados", () => {
  const ahora = 1_750_000_000_000;

  it("muestra aparatos hermanos cuando 2 dispositivos comparten una neurona marcada isThisDevice", () => {
    const senales = collectDetectedSignals({
      mesh: meshVacio,
      currentSyncId: "sync-telefono-02",
      now: ahora,
      includeExternal: false,
      neurons: [
        {
          id: "neu-compartida",
          name: "Maggaboard",
          kind: "tablet",
          online: true,
          lastSeenMs: ahora - 15_000,
          capabilities: ["WebRTC"],
          isThisDevice: true,
          aparatos: [
            {
              id: "sync-tablet-01",
              nombre: "Tableta",
              idUnico: "tab-01",
              color: "#0091ff",
              syncEstado: "activa",
              medio: "app-nativa",
              plataforma: "Android",
              visto: ahora - 20_000,
            },
            {
              id: "sync-telefono-02",
              nombre: "Teléfono",
              idUnico: "tel-02",
              color: "#46a758",
              syncEstado: "activa",
              medio: "app-nativa",
              plataforma: "Android",
              visto: ahora - 5_000,
            },
          ],
        },
      ],
    });

    const hermano = senales.find((s) => s.id === "aparato:neu-compartida:sync-tablet-01");
    expect(hermano).toBeDefined();
    expect(hermano!.label).toContain("Tableta");
    expect(hermano!.label).toContain("@tab-01");
    expect(hermano!.color).toBe("#0091ff");
    expect(hermano!.starseed?.aparatoHermano).toBe(true);
  });

  it("categoriza y ordena señales en mis aparatos, privados, públicos y entorno con antenas independientes", () => {
    const mockCuenta: DetectedSignal = {
      id: "neuron:n1",
      antenna: "account",
      antennaLabel: "Neuronas de tu cuenta",
      signalType: "Neurona StarSeed",
      label: "Maggabook",
      detail: "En línea",
      quality: 0.9,
      qualityDetail: "Presencia",
      metrics: [{ label: "Estado", value: "en línea" }],
      compatible: true,
      compatDetail: "Compatible",
      starseed: {
        via: "neuron-registry",
        sourceId: "n1",
        name: "Maggabook",
        ownAccount: true,
        online: true,
        capabilities: ["malla LoRa", "Bluetooth directo", "sincronización"],
      },
      placement: { angleRad: 0, radiusFrac: 0.3, accuracyFrac: 0.1, mode: "sector", distanceM: null, accuracyM: null, detail: "" },
      lastHeard: ahora,
      actions: [],
      simulated: false,
      color: "#38bdf8",
    };

    const mockPublico: DetectedSignal = {
      ...mockCuenta,
      id: "beacon:b1",
      antenna: "relay",
      label: "Nodo Comunitario Valle",
      starseed: {
        via: "relay-beacon",
        sourceId: "b1",
        name: "Nodo Comunitario Valle",
        ownAccount: false,
        publico: true,
        offersPublic: true,
        capabilities: ["relé StarSeed", "ofrece internet público"],
      },
    };

    const mockLanPrivado: DetectedSignal = {
      ...mockCuenta,
      id: "lan:192.168.1.42",
      antenna: "ip",
      label: "Maggabox LAN",
      starseed: {
        via: "direct-link",
        sourceId: "192.168.1.42",
        name: "Maggabox LAN",
        ownAccount: true,
        capabilities: ["Wi-Fi directo"],
      },
    };

    expect(clasificarCategoriaSenal(mockCuenta)).toBe("mis-aparatos");
    expect(clasificarCategoriaSenal(mockLanPrivado)).toBe("nodos-privados");
    expect(clasificarCategoriaSenal(mockPublico)).toBe("nodos-publicos");

    const antenasCuenta = extraerAntenasIndependientes(mockCuenta);
    expect(antenasCuenta.some((a) => a.tipo === "lora")).toBe(true);
    expect(antenasCuenta.some((a) => a.tipo === "ble")).toBe(true);
    expect(antenasCuenta.some((a) => a.tipo === "webrtc-p2p")).toBe(true);

    const grupos = agruparYOrdenarSenales([mockPublico, mockLanPrivado, mockCuenta]);
    expect(grupos.map((g) => g.categoria)).toEqual(["mis-aparatos", "nodos-privados", "nodos-publicos"]);
  });
});
