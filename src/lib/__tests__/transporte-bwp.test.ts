import { describe, expect, it } from "vitest";

import {
  estadoTransporte,
  transportesOrdenados,
  type TransporteBwp,
} from "@/ai/astraura/mesh/transporte-bwp";

describe("transporte BWP", () => {
  it("pone el transporte preferido primero sin perder ninguno", () => {
    const disponibles: TransporteBwp[] = [
      "wifi-mesh",
      "usb-serial",
      "reticulum",
      "webrtc-local",
    ];

    expect(transportesOrdenados(disponibles, "reticulum")).toEqual([
      "reticulum",
      "wifi-mesh",
      "usb-serial",
      "webrtc-local",
    ]);
    expect(disponibles).toEqual([
      "wifi-mesh",
      "usb-serial",
      "reticulum",
      "webrtc-local",
    ]);
  });

  it("mantiene el orden original si el preferido no se especifica o no está disponible", () => {
    const disponibles: TransporteBwp[] = ["wifi-mesh", "usb-serial"];

    expect(transportesOrdenados(disponibles)).toEqual(["wifi-mesh", "usb-serial"]);
    expect(transportesOrdenados(disponibles, "wifi-halo")).toEqual([
      "wifi-mesh",
      "usb-serial",
    ]);
  });

  it("devuelve offline si no hay vínculos", () => {
    expect(estadoTransporte([])).toEqual({
      online: false,
      mejor: null,
      totalKbps: 0,
    });
  });

  it("suma las tasas y elige el mejor vínculo por prioridad", () => {
    expect(
      estadoTransporte([
        { transporte: "usb-serial", rssi: -30, tasaKbps: 240 },
        { transporte: "wifi-halo", rssi: -82, tasaKbps: 800 },
        { transporte: "reticulum", tasaKbps: 60 },
      ]),
    ).toEqual({
      online: true,
      mejor: "wifi-halo",
      totalKbps: 1_100,
    });
  });
});
