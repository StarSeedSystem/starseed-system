/**
 * Tests del adaptador Wi-Fi (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaWifi, type EscaneoWifi } from "../wifi";
import type { SenalEspectro, SinFuente } from "../../tipos";
import { BANDAS_CONOCIDAS } from "../../bandas";

const AHORA = 1_700_000_000_000;

function entradaBase(overrides: Partial<EntradaWifi> = {}): EntradaWifi {
  return {
    senalesMedioInternet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
    enlacesDisponibles: [],
    escaneoNativo: null,
    ...overrides,
  };
}

function escaneoBase(overrides: Partial<EscaneoWifi> = {}): EscaneoWifi {
  return {
    canal: 6,
    frecuenciaMhz: 2437,
    anchoMhz: 20,
    rssi: -45,
    ...overrides,
  };
}

function esSenalesArray(x: { senales: readonly SenalEspectro[]; sinFuente: readonly SinFuente[] }): x is { senales: readonly SenalEspectro[]; sinFuente: readonly SinFuente[] } {
  return true;
}

describe("adaptadorWifi", () => {
  describe("sin escaneo nativo inyectado", () => {
    it("devuelve una señal de conexión actual y un sinFuente por no poder escanear", () => {
      const entrada = entradaBase({
        senalesMedioInternet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
        enlacesDisponibles: [],
        escaneoNativo: null,
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.sinFuente.length).toBe(1);
      expect(resultado.sinFuente[0].medio).toBe("wifi");
      expect(resultado.sinFuente[0].motivo).toBe("este aparato no deja escanear redes Wi-Fi desde la app");

      expect(resultado.senales.length).toBe(1);
      const senal = resultado.senales[0];
      expect(senal.medio).toBe("wifi");
      expect(senal.origen).toBe("medida");
      expect(senal.fuente).toContain("tu conexión actual");
      expect(senal.frecuenciaKhz).toBeNull();
      expect(senal.banda).toBe("Wi-Fi (conexión actual)");
      expect(senal.fuerzaDbm).toBeNull();
      expect(senal.vinculo).toBeUndefined();
    });

    it("si no hay internet, la señal tiene origen 'estimada' y mbps null", () => {
      const entrada = entradaBase({
        senalesMedioInternet: { enLinea: false },
        enlacesDisponibles: [],
        escaneoNativo: null,
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales.length).toBe(1);
      const senal = resultado.senales[0];
      expect(senal.origen).toBe("estimada");
      expect(senal.fuente).toContain("tu conexión actual");
    });

    it("incluye enlaces medidos como señales separadas con rttMs y capacidadKbps", () => {
      const entrada = entradaBase({
        senalesMedioInternet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
        enlacesDisponibles: [
          { id: "enlace-1", tipo: "nativo", abierto: true, rttMs: 12, capacidadKbps: 80000, alcanza: { neuronDeviceId: "neurona-abc" } },
          { id: "enlace-2", tipo: "local", abierto: true, ruta: "misma-red-local", rttMs: 8, capacidadKbps: 120000, alcanza: { neuronDeviceId: "neurona-def" } },
        ],
        escaneoNativo: null,
      });

      const resultado = adaptadorWifi(entrada);

      // 1 señal de conexión + 2 enlaces medidos
      expect(resultado.senales.length).toBe(3);
      const enlace1 = resultado.senales.find(s => s.vinculo?.id === "neurona-abc");
      const enlace2 = resultado.senales.find(s => s.vinculo?.id === "neurona-def");
      expect(enlace1).toBeDefined();
      expect(enlace2).toBeDefined();
      expect(enlace1!.frecuenciaKhz).toBeNull();
      expect(enlace1!.banda).toBe("Wi-Fi (enlace medido)");
      expect(enlace1!.origen).toBe("medida");
      expect(enlace1!.calidad).not.toBeNull();
    });
  });

  describe("con escaneo nativo inyectado", () => {
    it("convierte cada escaneo a SenalEspectro con banda y frecuencia correctas", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          escaneoBase({ canal: 1, frecuenciaMhz: 2412, anchoMhz: 20, rssi: -40 }),
          escaneoBase({ canal: 6, frecuenciaMhz: 2437, anchoMhz: 20, rssi: -55 }),
          escaneoBase({ canal: 36, frecuenciaMhz: 5180, anchoMhz: 40, rssi: -60 }),
          escaneoBase({ canal: 149, frecuenciaMhz: 5745, anchoMhz: 80, rssi: -50 }),
        ],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales.length).toBe(4);
      for (const senal of resultado.senales) {
        expect(senal.medio).toBe("wifi");
        expect(senal.frecuenciaKhz).not.toBeNull();
        expect(senal.anchoKhz).not.toBeNull();
        expect(senal.fuerzaDbm).not.toBeNull();
        expect(senal.origen).toBe("medida");
        expect(senal.banda).toMatch(/^Wi-Fi/);
        // NUNCA incluye SSID ni BSSID
        const senalJson = JSON.stringify(senal);
        expect(senalJson).not.toContain("SSID");
        expect(senalJson).not.toContain("BSSID");
      }
    });

    it("determina banda correcta por frecuencia (2.4 GHz, 5 GHz, 6 GHz)", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          escaneoBase({ canal: 1, frecuenciaMhz: 2412, anchoMhz: 20, rssi: -40 }),   // 2.4 GHz
          escaneoBase({ canal: 36, frecuenciaMhz: 5180, anchoMhz: 40, rssi: -60 }),  // 5 GHz
          escancoBase({ canal: 1, frecuenciaMhz: 5935, anchoMhz: 20, rssi: -50 }),   // 6 GHz
        ],
      });

      const resultado = adaptadorWifi(entrada);

      const senal24 = resultado.senales.find(s => s.frecuenciaKhz === 2412000);
      const senal5 = resultado.senales.find(s => s.frecuenciaKhz === 5180000);
      const senal6 = resultado.senales.find(s => s.frecuenciaKhz === 5935000);

      expect(senal24).toBeDefined();
      expect(senal24!.banda).toBe("Wi-Fi 2,4 GHz");
      expect(senal5).toBeDefined();
      expect(senal5!.banda).toBe("Wi-Fi 5 GHz");
      expect(senal6).toBeDefined();
      expect(senal6!.banda).toBe("Wi-Fi 6 GHz (Wi-Fi 6E/7)");
    });

    it("si falta el canal pero hay frecuencia, usa frecuencia para determinar banda", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          { frecuenciaMhz: 2437, anchoMhz: 20, rssi: -50 }, // sin canal
          { frecuenciaMhz: 5500, anchoMhz: 40, rssi: -60 },  // sin canal
        ],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales.length).toBe(2);
      expect(resultado.senales[0].banda).toBe("Wi-Fi 2,4 GHz");
      expect(resultado.senales[1].banda).toBe("Wi-Fi 5 GHz");
    });

    it("si no hay ni canal ni frecuencia, banda es 'Wi-Fi (desconocido)' y frecuenciaKhz null", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          { rssi: -50, anchoMhz: 20 }, // sin canal ni frecuencia
        ],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales.length).toBe(1);
      expect(resultado.senales[0].banda).toBe("Wi-Fi (desconocido)");
      expect(resultado.senales[0].frecuenciaKhz).toBeNull();
      expect(resultado.senales[0].anchoKhz).toBe(20000);
    });

    it("calidad calculada desde RSSI (0..1, -110 = 0, -40 = 1)", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          escaneoBase({ rssi: -110 }),
          escaneoBase({ rssi: -40 }),
          escaneoBase({ rssi: -75 }), // medio
        ],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales[0].calidad).toBeCloseTo(0, 2);
      expect(resultado.senales[1].calidad).toBeCloseTo(1, 2);
      expect(resultado.senales[2].calidad).toBeCloseTo(0.5, 1);
    });

    it("sin RSSI → fuerzaDbm null, calidad null, origen 'estimada'", () => {
      const entrada = entradaBase({
        escaneoNativo: [
          { canal: 6, frecuenciaMhz: 2437, anchoMhz: 20 }, // sin rssi
        ],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.senales[0].fuerzaDbm).toBeNull();
      expect(resultado.senales[0].calidad).toBeNull();
      expect(resultado.senales[0].origen).toBe("estimada");
    });
  });

  describe("sinFuente siempre presente cuando no hay escaneo nativo", () => {
    it("sinFuente incluido aunque haya conexión y enlaces", () => {
      const entrada = entradaBase({
        senalesMedioInternet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
        enlacesDisponibles: [{ id: "e1", tipo: "nativo", abierto: true, rttMs: 10, capacidadKbps: 50000, alcanza: { neuronDeviceId: "n1" } }],
        escaneoNativo: null,
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.sinFuente.length).toBe(1);
      expect(resultado.sinFuente[0].medio).toBe("wifi");
    });

    it("sinFuente NO incluido cuando hay escaneo nativo", () => {
      const entrada = entradaBase({
        escaneoNativo: [escaneoBase()],
      });

      const resultado = adaptadorWifi(entrada);

      expect(resultado.sinFuente.length).toBe(0);
    });
  });

  describe("nada inventado: valores null cuando faltan datos", () => {
    it("frecuenciaKhz null si no se puede determinar", () => {
      const entrada = entradaBase({
        escaneoNativo: [{ rssi: -50 }], // sin canal ni frecuencia
      });
      const resultado = adaptadorWifi(entrada);
      expect(resultado.senales[0].frecuenciaKhz).toBeNull();
    });

    it("anchoKhz null si no viene en el escaneo", () => {
      const entrada = entradaBase({
        escaneoNativo: [{ canal: 6, frecuenciaMhz: 2437, rssi: -50 }], // sin anchoMhz
      });
      const resultado = adaptadorWifi(entrada);
      expect(resultado.senales[0].anchoKhz).toBeNull();
    });

    it("zona siempre null (privacidad: no coordenadas exactas)", () => {
      const entrada = entradaBase({
        escaneoNativo: [escaneoBase()],
      });
      const resultado = adaptadorWifi(entrada);
      expect(resultado.senales[0].zona).toBeNull();
    });

    it("vinculo siempre undefined (no se vincula a antena/cerebro/nodo específico)", () => {
      const entrada = entradaBase({
        escaneoNativo: [escaneoBase()],
      });
      const resultado = adaptadorWifi(entrada);
      expect(resultado.senales[0].vinculo).toBeUndefined();
    });
  });
});

// Helper para tests (debe estar al final para no romper el tipo)
function escancoBase(overrides: Partial<EscaneoWifi> = {}): EscaneoWifi {
  return escaneoBase(overrides);
}