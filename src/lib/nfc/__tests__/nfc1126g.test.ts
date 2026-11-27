import { describe, expect, it } from "vitest";
import {
  aBase64Url,
  decidirAcercarBle,
  deBase64Url,
  describirCapacidad,
  qrATarjeta,
  tarjetaAQr,
  viasDisponibles,
} from "../respaldo";
import type { TarjetaNeurona } from "../tarjeta";

const tarjeta: TarjetaNeurona = {
  version: 1,
  neuronaId: "neurona-prueba",
  clavePublica: "a".repeat(64),
  cuenta: { modo: "alias", valor: "maggasukha" },
  claveEfimera: "b".repeat(64),
  nonce: "c".repeat(32),
  emitidaEn: 1_700_000_000_000,
  ofertas: ["archivos"],
  transportes: [{ tipo: "ble", direccion: "AA:BB:CC:DD:EE:FF" }],
  firma: "d".repeat(128),
};

describe("respaldo sin NFC", () => {
  it("base64url va y vuelve con cualquier largo", () => {
    for (let n = 0; n < 12; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 200) % 256);
      expect(Array.from(deBase64Url(aBase64Url(b)) ?? [])).toEqual(Array.from(b));
    }
    expect(deBase64Url("a")).toBeNull();
    expect(deBase64Url("a+b/")).toBeNull();
  });

  it("el QR lleva la misma tarjeta", () => {
    const q = tarjetaAQr(tarjeta);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const r = qrATarjeta(q.texto);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tarjeta).toEqual(tarjeta);
  });

  it("rechaza QR ajenos o rotos", () => {
    expect(qrATarjeta("https://ejemplo.com").ok).toBe(false);
    expect(qrATarjeta("ssn1:@@@").ok).toBe(false);
    expect(qrATarjeta("ssn1:AAAA").ok).toBe(false);
  });

  it("elige la mejor vía y siempre deja respaldo", () => {
    expect(viasDisponibles({ nfc: "lector", ble: true, pantalla: true })).toEqual(["nfc", "ble", "qr"]);
    expect(viasDisponibles({ nfc: "web", ble: false, pantalla: true })).toEqual(["qr"]);
    expect(describirCapacidad({ nfc: "ninguno", ble: true, pantalla: true })).toEqual({ via: "ble", nfc: "ninguno", respaldo: ["qr"] });
  });

  it("BLE pide señal muy alta y confirmación en los dos", () => {
    expect(decidirAcercarBle({ rssi: -70, confirmaLocal: true, confirmaRemota: true })).toBe("esperar");
    expect(decidirAcercarBle({ rssi: null, confirmaLocal: true, confirmaRemota: true })).toBe("esperar");
    expect(decidirAcercarBle({ rssi: -40, confirmaLocal: true, confirmaRemota: false })).toBe("confirmar");
    expect(decidirAcercarBle({ rssi: -40, confirmaLocal: true, confirmaRemota: true })).toBe("aceptar");
  });
});
