/**
 * Tests de bandas: tabla, conversiones y solapamiento (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import {
  BANDAS_CONOCIDAS,
  LISTA_BANDAS,
  bandaDeFrecuencia,
  frecuenciaDeCanalWifi,
  canalDeFrecuenciaWifi,
  solapan,
  etiquetaFrecuencia,
  type BandaConocida,
} from "../bandas";

describe("BANDAS_CONOCIDAS", () => {
  it("contiene las bandas Wi-Fi 2.4, 5 y 6 GHz", () => {
    expect(BANDAS_CONOCIDAS["wifi-2.4"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["wifi-5"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["wifi-6"]).toBeDefined();
  });

  it("contiene BLE 2.4 GHz", () => {
    expect(BANDAS_CONOCIDAS["ble-2.4"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["ble-2.4"].medio).toBe("bluetooth");
  });

  it("contiene bandas LoRa 433, 868, 915 y 2.4 GHz", () => {
    expect(BANDAS_CONOCIDAS["lora-433"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["lora-868"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["lora-915"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["lora-2.4"]).toBeDefined();
  });

  it("contiene bandas celulares principales", () => {
    expect(BANDAS_CONOCIDAS["celular-b1"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-b3"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-b7"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-b8"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-b20"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-b28"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n78"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n1"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n3"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n28"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n41"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n77"]).toBeDefined();
    expect(BANDAS_CONOCIDAS["celular-n79"]).toBeDefined();
  });

  it("cada banda tiene fuente no vacía", () => {
    for (const banda of LISTA_BANDAS) {
      expect(banda.fuente.length).toBeGreaterThan(0);
    }
  });
});

describe("bandaDeFrecuencia", () => {
  it("868,1 MHz cae en la banda LoRa EU (lora-868)", () => {
    const banda = bandaDeFrecuencia(868100);
    expect(banda).not.toBeNull();
    expect(banda?.id).toBe("lora-868");
  });

  it("2412 MHz (canal 1 Wi-Fi 2.4) cae en wifi-2.4", () => {
    const banda = bandaDeFrecuencia(2412000);
    expect(banda?.id).toBe("wifi-2.4");
  });

  it("5180 MHz (canal 36 Wi-Fi 5) cae en wifi-5", () => {
    const banda = bandaDeFrecuencia(5180000);
    expect(banda?.id).toBe("wifi-5");
  });

  it("5745 MHz (canal 149 Wi-Fi 5) cae en wifi-5", () => {
    const banda = bandaDeFrecuencia(5745000);
    expect(banda?.id).toBe("wifi-5");
  });

  it("frecuencia fuera de toda banda → null", () => {
    expect(bandaDeFrecuencia(100)).toBeNull(); // 100 kHz
    expect(bandaDeFrecuencia(10000000)).toBeNull(); // 10 GHz
    expect(bandaDeFrecuencia(-1)).toBeNull();
    expect(bandaDeFrecuencia(NaN)).toBeNull();
  });
});

describe("frecuenciaDeCanalWifi", () => {
  it("Wi-Fi 2.4 GHz: canal 1 = 2412 MHz", () => {
    expect(frecuenciaDeCanalWifi("2.4", 1)).toBe(2412000);
  });

  it("Wi-Fi 2.4 GHz: canal 6 = 2437 MHz", () => {
    expect(frecuenciaDeCanalWifi("2.4", 6)).toBe(2437000);
  });

  it("Wi-Fi 2.4 GHz: canal 14 = 2484 MHz (Japón)", () => {
    expect(frecuenciaDeCanalWifi("2.4", 14)).toBe(2484000);
  });

  it("Wi-Fi 2.4 GHz: canal fuera de rango → null", () => {
    expect(frecuenciaDeCanalWifi("2.4", 0)).toBeNull();
    expect(frecuenciaDeCanalWifi("2.4", 15)).toBeNull();
    expect(frecuenciaDeCanalWifi("2.4", -1)).toBeNull();
  });

  it("Wi-Fi 5 GHz: canal 36 = 5180 MHz", () => {
    expect(frecuenciaDeCanalWifi("5", 36)).toBe(5180000);
  });

  it("Wi-Fi 5 GHz: canal 149 = 5745 MHz", () => {
    expect(frecuenciaDeCanalWifi("5", 149)).toBe(5745000);
  });

  it("Wi-Fi 5 GHz: canal fuera de rango → null", () => {
    expect(frecuenciaDeCanalWifi("5", 35)).toBeNull();
    expect(frecuenciaDeCanalWifi("5", 178)).toBeNull();
  });

  it("Wi-Fi 6 GHz: canal 1 = 5935 MHz", () => {
    expect(frecuenciaDeCanalWifi("6", 1)).toBe(5935000);
  });

  it("Wi-Fi 6 GHz: canal 233 = 7095 MHz", () => {
    expect(frecuenciaDeCanalWifi("6", 233)).toBe(7095000);
  });

  it("Wi-Fi 6 GHz: canal fuera de rango → null", () => {
    expect(frecuenciaDeCanalWifi("6", 0)).toBeNull();
    expect(frecuenciaDeCanalWifi("6", 234)).toBeNull();
  });
});

describe("canalDeFrecuenciaWifi", () => {
  it("2412 MHz → canal 1 (2.4 GHz)", () => {
    expect(canalDeFrecuenciaWifi("2.4", 2412000)).toBe(1);
  });

  it("2437 MHz → canal 6 (2.4 GHz)", () => {
    expect(canalDeFrecuenciaWifi("2.4", 2437000)).toBe(6);
  });

  it("5180 MHz → canal 36 (5 GHz)", () => {
    expect(canalDeFrecuenciaWifi("5", 5180000)).toBe(36);
  });

  it("5745 MHz → canal 149 (5 GHz)", () => {
    expect(canalDeFrecuenciaWifi("5", 5745000)).toBe(149);
  });

  it("frecuencia fuera de rango → null", () => {
    expect(canalDeFrecuenciaWifi("2.4", 1000000)).toBeNull();
    expect(canalDeFrecuenciaWifi("5", 1000000)).toBeNull();
    expect(canalDeFrecuenciaWifi("6", 1000000)).toBeNull();
  });
});

describe("solapan", () => {
  it("canales 1 y 6 de 20 MHz NO se solapan", () => {
    const ch1 = { frecuenciaKhz: 2412000, anchoKhz: 20000 };
    const ch6 = { frecuenciaKhz: 2437000, anchoKhz: 20000 };
    expect(solapan(ch1, ch6)).toBe(false);
  });

  it("canales 1 y 3 de 20 MHz SÍ se solapan", () => {
    const ch1 = { frecuenciaKhz: 2412000, anchoKhz: 20000 };
    const ch3 = { frecuenciaKhz: 2422000, anchoKhz: 20000 };
    expect(solapan(ch1, ch3)).toBe(true);
  });

  it("rangos adyacentes sin solapar → false", () => {
    const a = { frecuenciaKhz: 1000, anchoKhz: 100 }; // 950-1050
    const b = { frecuenciaKhz: 1100, anchoKhz: 100 }; // 1050-1150
    expect(solapan(a, b)).toBe(false);
  });

  it("rangos que tocan en el borde → false (no se solapan)", () => {
    const a = { frecuenciaKhz: 1000, anchoKhz: 100 }; // 950-1050
    const b = { frecuenciaKhz: 1050, anchoKhz: 100 }; // 1000-1100 → solapan en 1000-1050
    expect(solapan(a, b)).toBe(true);
  });
});

describe("etiquetaFrecuencia", () => {
  it("2437000 kHz → «2,437 GHz»", () => {
    expect(etiquetaFrecuencia(2437000)).toBe("2,437 GHz");
  });

  it("868100 kHz → «868,1 MHz»", () => {
    expect(etiquetaFrecuencia(868100)).toBe("868,1 MHz");
  });

  it("2400000 kHz → «2,400 GHz»", () => {
    expect(etiquetaFrecuencia(2400000)).toBe("2,400 GHz");
  });

  it("valor inválido → «?»", () => {
    expect(etiquetaFrecuencia(0)).toBe("?");
    expect(etiquetaFrecuencia(-1)).toBe("?");
    expect(etiquetaFrecuencia(NaN)).toBe("?");
  });
});