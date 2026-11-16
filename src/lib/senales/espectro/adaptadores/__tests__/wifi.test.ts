import { describe, it, expect } from "vitest";
import { adaptadorWifi, obtenerBandaDesdeFrecuencia, escaneoASenal } from "../wifi";

describe("obtenerBandaDesdeFrecuencia", () => {
  it("retorna 2.4GHz para frecuencias de banda 2.4GHz", () => {
    expect(obtenerBandaDesdeFrecuencia(2412)).toBe("2.4GHz");
    expect(obtenerBandaDesdeFrecuencia(2437)).toBe("2.4GHz");
    expect(obtenerBandaDesdeFrecuencia(2462)).toBe("2.4GHz");
  });

  it("retorna 5GHz para frecuencias de banda 5GHz", () => {
    expect(obtenerBandaDesdeFrecuencia(5180)).toBe("5GHz");
    expect(obtenerBandaDesdeFrecuencia(5745)).toBe("5GHz");
  });

  it("retorna 6GHz para frecuencias de banda 6GHz", () => {
    expect(obtenerBandaDesdeFrecuencia(6400)).toBe("6GHz");
  });

  it("retorna undefined para frecuencias fuera de rango", () => {
    expect(obtenerBandaDesdeFrecuencia(1000)).toBeUndefined();
    expect(obtenerBandaDesdeFrecuencia(undefined)).toBeUndefined();
  });
});

describe("escaneoASenal", () => {
  it("convierte un escaneo a señal con los campos correctos", () => {
    const escaneo = { frecuenciaMhz: 2412, rssi: -50 };
    const senal = escaneoASenal(escaneo, 1234567890);
    expect(senal.tipo).toBe("wifi");
    expect(senal.frecuenciaMhz).toBe(2412);
    expect(senal.banda).toBe("2.4GHz");
    expect(senal.rssi).toBe(-50);
    expect(senal.origen).toBe("medida");
    expect(senal.timestamp).toBe(1234567890);
  });
});

describe("adaptadorWifi", () => {
  it("debe retornar motivo de falta de fuente cuando no hay escaneo", () => {
    const resultado = adaptadorWifi(null, null);
    expect(resultado.sinFuente).toContainEqual({
      medio: "wifi",
      motivo: "este aparato no deja escanear redes Wi-Fi desde la app",
    });
    expect(resultado.senales).toEqual([]);
  });

  it("debe generar una señal de conexión actual cuando hay conexión pero no escaneo", () => {
    const resultado = adaptadorWifi({ rttMs: 50, capacidadKbps: 5000 }, null);
    expect(resultado.sinFuente).toContainEqual({
      medio: "wifi",
      motivo: "este aparato no deja escanear redes Wi-Fi desde la app",
    });
    expect(resultado.senales).toHaveLength(1);
    expect(resultado.senales[0].tipo).toBe("wifi");
    expect(resultado.senales[0].origen).toBe("medida");
  });

  it("debe convertir escaneo a señales con banda y frecuencia correctas", () => {
    const escaneo = [
      { frecuenciaMhz: 2412, rssi: -50 },
      { frecuenciaMhz: 5180, rssi: -60 },
      { frecuenciaMhz: 6400, rssi: -70 },
    ];
    const resultado = adaptadorWifi({ rttMs: 30 }, escaneo);
    expect(resultado.sinFuente).toEqual([]);
    expect(resultado.senales).toHaveLength(3);
    expect(resultado.senales[0].banda).toBe("2.4GHz");
    expect(resultado.senales[0].frecuenciaMhz).toBe(2412);
    expect(resultado.senales[0].rssi).toBe(-50);
    expect(resultado.senales[0].origen).toBe("medida");

    expect(resultado.senales[1].banda).toBe("5GHz");
    expect(resultado.senales[1].frecuenciaMhz).toBe(5180);

    expect(resultado.senales[2].banda).toBe("6GHz");
    expect(resultado.senales[2].frecuenciaMhz).toBe(6400);
  });

  it("debe incluir timestamp actual en las señales", () => {
    const ahora = Date.now();
    const escaneo = [{ frecuenciaMhz: 2437, rssi: -45 }];
    const resultado = adaptadorWifi(null, escaneo);
    expect(resultado.senales[0].timestamp).toBeGreaterThanOrEqual(ahora - 100);
    expect(resultado.senales[0].timestamp).toBeLessThanOrEqual(ahora + 100);
  });
});