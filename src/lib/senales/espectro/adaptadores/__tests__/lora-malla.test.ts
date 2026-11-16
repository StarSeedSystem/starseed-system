/**
 * Tests del adaptador LoRa (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorLora, type EntradaLora, type ResultadoLora } from "../lora-malla";
import type { SenalEspectro, SinFuente } from "../../tipos";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { AHORA } from "../../__fixtures__/vivo";

const AHORA_TEST = 1_700_000_000_000;

function entradaBaseLora(overrides: Partial<EntradaLora> = {}): EntradaLora {
  return {
    senalesMedioLora: {
      estado: "listo",
      transporte: "daemon",
      nodos: 0,
      region: undefined,
      preset: undefined,
      ...overrides.senalesMedioLora,
    },
    sealesDetectadas: overrides.sealesDetectadas ?? [],
    ahora: AHORA_TEST,
    ...overrides,
  };
}

function senalLoraDetectada(
  id: string,
  overrides: Partial<DetectedSignal> = {},
): DetectedSignal {
  return {
    id,
    antenna: "lora",
    antennaLabel: "Malla LoRa (Meshtastic)",
    signalType: "LoRa · Meshtastic",
    label: `Nodo ${id}`,
    detail: "Nodo Meshtastic al alcance",
    quality: 0.5,
    qualityDetail: "calidad de prueba",
    metrics: [],
    compatible: true,
    compatDetail: "Compatible con la malla",
    starseed: null,
    placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "rf", distanceM: 300, accuracyM: 100, detail: "colocación de prueba" },
    lastHeard: AHORA_TEST,
    actions: [],
    simulated: false,
    color: "#34d399",
    ...overrides,
  };
}

describe("adaptadorLora", () => {
  describe("sin radio conectada", () => {
    it("devuelve sinFuente 'no hay radio LoRa conectada'", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "sin-radio",
          transporte: null,
          nodos: 0,
        },
        sealesDetectadas: [],
      });

      const resultado = adaptadorLora(entrada);

      expect(resultado.sinFuente.length).toBe(1);
      expect(resultado.sinFuente[0].medio).toBe("lora");
      expect(resultado.sinFuente[0].motivo).toBe("no hay radio LoRa conectada");

      expect(resultado.senales.length).toBe(0);
    });
  });

  describe("con radio conectada y región EU", () => {
    it("devuelve señal LoRa con banda y frecuencia de la región EU_868", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "daemon",
          nodos: 2,
          region: "EU_868",
        },
        sealesDetectadas: [
          senalLoraDetectada("n1", {
            metrics: [
              { label: "SNR", value: "-7.5 dB" },
              { label: "RSSI", value: "-98 dBm" },
            ],
          }),
        ],
      });

      const resultado = adaptadorLora(entrada);

      expect(resultado.sinFuente.length).toBe(0);
      expect(resultado.senales.length).toBe(1);
      const senal = resultado.senales[0];
      expect(senal.medio).toBe("lora");
      expect(senal.banda).toBe("LoRa 868 MHz");
      expect(senal.frecuenciaKhz).toBe(868500);
      expect(senal.calidad).not.toBeNull();
    });

    it("incluye ancho del preset si lo informa la región", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "daemon",
          nodos: 1,
          region: "EU_868",
        },
        sealesDetectadas: [
          senalLoraDetectada("n1"),
        ],
      });

      const resultado = adaptadorLora(entrada);

      const senal = resultado.senales[0];
      expect(senal.frecuenciaKhz).toBe(868500);
      expect(senal.anchoKhz).toBe(125000);
    });
  });

  describe("nodos con SNR", () => {
    it("calcula calidad desde SNR de la señal detectada", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "ble",
          nodos: 1,
        },
        sealesDetectadas: [
          senalLoraDetectada("n1", {
            metrics: [
              { label: "SNR", value: "-7.5 dB" },
            ],
          }),
        ],
      });

      const resultado = adaptadorLora(entrada);

      const senal = resultado.senales[0];
      expect(senal.calidad).not.toBeNull();
      expect(typeof senal.calidad).toBe("number");
    });

    it("calcula calidad desde RSSI de la señal detectada", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "daemon",
          nodos: 1,
        },
        sealesDetectadas: [
          senalLoraDetectada("n1", {
            metrics: [
              { label: "RSSI", value: "-98 dBm" },
            ],
          }),
        ],
      });

      const resultado = adaptadorLora(entrada);

      const senal = resultado.senales[0];
      expect(senal.calidad).not.toBeNull();
      expect(typeof senal.calidad).toBe("number");
    });
  });

  describe("sin frecuencia ni banda inventadas", () => {
    it("frecuenciaKhz null si no se puede determinar la región", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "daemon",
          nodos: 1,
          region: undefined,
          preset: undefined,
        },
        sealesDetectadas: [
          senalLoraDetectada("n1"),
        ],
      });

      const resultado = adaptadorLora(entrada);

      const senal = resultado.senales[0];
      expect(senal.frecuenciaKhz).toBeNull();
      expect(senal.banda).toBe("LoRa (desconocido)");
    });

    it("banda es 'LoRa (desconocido)' cuando no hay región ni preset", () => {
      const entrada = entradaBaseLora({
        senalesMedioLora: {
          estado: "listo",
          transporte: "daemon",
          nodos: 1,
          region: undefined,
          preset: undefined,
        },
        sealesDetectadas: [
          senalLoraDetectada("n1"),
        ],
      });

      const resultado = adaptadorLora(entrada);

      const senal = resultado.senales[0];
      expect(senal.banda).toBe("LoRa (desconocido)");
    });
  });
});