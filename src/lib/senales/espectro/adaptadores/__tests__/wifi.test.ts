/**
 * Tests del adaptador Wi-Fi (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaWifi, type EscaneoWifi } from "../wifi";

describe("adaptadorWifi", () => {
  it("sin escaneo nativo devuelve sinFuente y señal de conexión actual", () => {
    const entrada: EntradaWifi = { enLinea: true };
    const resultado = adaptadorWifi(entrada);

    expect(resultado.sinFuente.length).toBe(1);
    expect(resultado.sinFuente[0].medio).toBe("wifi");
    expect(resultado.sinFuente[0].motivo).toContain("este aparato no deja escanear redes");

    expect(resultado.senales.length).toBe(1);
    expect(resultado.senales[0].medio).toBe("wifi");
    expect(resultado.senales[0].frecuenciaKhz).toBeNull();
    expect(resultado.senales[0].origen).toBe("medida");
  });

  it("con escaneo falso (nativo inyectado) devuelve señales con banda y frecuencia correctas y sin SSID", () => {
    const escaneo: EscaneoWifi[] = [
      { id: "net-1", canal: 6, rssi: -60, at: 1_700_000_000_000 },
      { id: "net-2", frecuenciaMhz: 5180, anchoMhz: 20, rssi: -50, at: 1_700_000_000_000 },
    ];
    const entrada: EntradaWifi = { escaneoNativo: escaneo };
    const resultado = adaptadorWifi(entrada);

    expect(resultado.sinFuente.length).toBe(0);
    expect(resultado.senales.length).toBe(2);

    // Primera red (canal 6 -> 2437 MHz -> 2437000 kHz)
    expect(resultado.senales[0].frecuenciaKhz).toBe(2437000);
    expect(resultado.senales[0].fuerzaDbm).toBe(-60);
    expect(resultado.senales[0].origen).toBe("medida");

    // Segunda red (frecuencia 5180 MHz -> 5180000 kHz)
    expect(resultado.senales[1].frecuenciaKhz).toBe(5180000);
    expect(resultado.senales[1].fuerzaDbm).toBe(-50);

    // Comprobar que ningún campo contiene SSID, BSSID o nombre de red visible
    const senalJson = JSON.stringify(resultado.senales[0]);
    expect(senalJson).not.toContain("SSID");
    expect(senalJson).not.toContain("BSSID");
    expect(senalJson).not.toContain("nombre");
    expect(senalJson).not.toContain("nombreSecreto");
    expect(senalJson).not.toContain("nombre_");
  });

  it("nada inventado cuando falta el canal o frecuencia", () => {
    const escaneo: EscaneoWifi[] = [
      { id: "net-incompleta" },
    ];
    const entrada: EntradaWifi = { escaneoNativo: escaneo };
    const resultado = adaptadorWifi(entrada);

    expect(resultado.senales.length).toBe(1);
    expect(resultado.senales[0].frecuenciaKhz).toBeNull();
    expect(resultado.senales[0].anchoKhz).toBeNull();
    expect(resultado.senales[0].fuerzaDbm).toBeNull();
    expect(resultado.senales[0].origen).toBe("estimada");
  });
});
