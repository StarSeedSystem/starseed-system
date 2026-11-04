import { describe, expect, it } from "vitest";
import {
  tipoEstadoTransporte,
  type EstadoTransporte,
  type ResumenTransportes,
  resumirTransportes,
} from "@/lib/malla/estado-transportes";

describe("estado-transportes — resumen puro de transportes", () => {
  it("devuelve todos los medios conocidos con su estado", () => {
    const resumen = resumirTransportes({});
    expect(resumen.medios).toHaveLength(9);
    const ids = resumen.medios.map((m) => m.medio);
    expect(ids).toEqual(["lora", "ble", "wifi-lan", "webrtc", "wifi-mesh", "reticulum", "serie", "servidor", "nfc"]);
  });

  it("lora es usable si hay radio Meshtastic conectada", () => {
    const conRadio = resumirTransportes({ lora: true });
    const lora = conRadio.medios.find((m) => m.medio === "lora")!;
    expect(lora.estado).toBe("usable");
    expect(lora.motivo).toMatch(/radio Meshtastic/i);

    const sinRadio = resumirTransportes({ lora: false });
    const lora2 = sinRadio.medios.find((m) => m.medio === "lora")!;
    expect(lora2.estado).toBe("detectado");
    expect(lora2.motivo).toMatch(/Radio Meshtastic no conectada/i);
  });

  it("ble está pendiente (Bluetooth nativo pendiente)", () => {
    const resumen = resumirTransportes({});
    const ble = resumen.medios.find((m) => m.medio === "ble")!;
    expect(ble.estado).toBe("pendiente");
    expect(ble.motivo).toMatch(/Bluetooth nativo pendiente/i);
  });

  it("wifi-lan y webrtc son usables (P2P local)", () => {
    const resumen = resumirTransportes({});
    const wifiLan = resumen.medios.find((m) => m.medio === "wifi-lan")!;
    expect(wifiLan.estado).toBe("usable");
    expect(wifiLan.motivo).toMatch(/P2P local/i);

    const webrtc = resumen.medios.find((m) => m.medio === "webrtc")!;
    expect(webrtc.estado).toBe("usable");
    expect(webrtc.motivo).toMatch(/WebRTC/i);
  });

  it("wifi-mesh es usable (802.11s/batman-adv)", () => {
    const resumen = resumirTransportes({});
    const wifiMesh = resumen.medios.find((m) => m.medio === "wifi-mesh")!;
    expect(wifiMesh.estado).toBe("usable");
    expect(wifiMesh.motivo).toMatch(/802\.11s|batman-adv/i);
  });

  it("reticulum está detectado pero pendiente (solo detección)", () => {
    const resumen = resumirTransportes({});
    const reticulum = resumen.medios.find((m) => m.medio === "reticulum")!;
    expect(reticulum.estado).toBe("pendiente");
    expect(reticulum.motivo).toMatch(/solo detección|transporte RNS pendiente/i);
  });

  it("serie está pendiente (Windows/Android pendiente)", () => {
    const resumen = resumirTransportes({});
    const serie = resumen.medios.find((m) => m.medio === "serie")!;
    expect(serie.estado).toBe("pendiente");
    expect(serie.motivo).toMatch(/Windows.*Android|serie pendiente/i);
  });

  it("servidor es usable (relé cifrado)", () => {
    const resumen = resumirTransportes({});
    const servidor = resumen.medios.find((m) => m.medio === "servidor")!;
    expect(servidor.estado).toBe("usable");
    expect(servidor.motivo).toMatch(/relé cifrado/i);
  });

  it("nfc es usable con límite de 32 KB para dato público", () => {
    const resumen = resumirTransportes({});
    const nfc = resumen.medios.find((m) => m.medio === "nfc")!;
    expect(nfc.estado).toBe("usable");
    expect(nfc.motivo).toMatch(/32 KB|tramas cortas/i);
  });

  it("tipoEstadoTransporte clasifica correctamente", () => {
    expect(tipoEstadoTransporte("usable")).toBe("usable");
    expect(tipoEstadoTransporte("detectado")).toBe("detectado");
    expect(tipoEstadoTransporte("pendiente")).toBe("pendiente");
  });

  it("resumen incluye contadores por estado", () => {
    const resumen = resumirTransportes({ lora: true });
    expect(resumen.contadores.usable).toBeGreaterThan(0);
    expect(resumen.contadores.pendiente).toBeGreaterThan(0);
    expect(resumen.contadores.detectado).toBeGreaterThanOrEqual(0);
  });
});