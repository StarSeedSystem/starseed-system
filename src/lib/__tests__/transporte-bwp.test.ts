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
