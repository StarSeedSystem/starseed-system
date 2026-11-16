/**
 * Tests del adaptador Bluetooth (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptarBluetooth, type EntradaBluetooth } from "../bluetooth";
import type { BleDetection } from "@/ai/astraura/mesh/signals";
import type { SinFuente, SenalEspectro } from "../../modelo";

const AHORA = 1_700_000_000_000;

function deteccionBase(overrides: Partial<BleDetection> = {}): BleDetection {
  return {
    id: "dev-1",
    name: "Mi Auricular",
    rssi: -55,
    txPower: null,
    uuids: ["0000180d-0000-1000-8000-00805f9b34fb"],
    at: AHORA - 10_000,
    viaPicker: false,
    ...overrides,
  };
}

function entradaBase(overrides: Partial<EntradaBluetooth> = {}): EntradaBluetooth {
  return {
    disponible: true,
    detecciones: [],
    ...overrides,
  };
}

function esSenalesArray(x: readonly SenalEspectro[] | SinFuente): x is readonly SenalEspectro[] {
  return Array.isArray(x);
}

function esSinFuente(x: readonly SenalEspectro[] | SinFuente): x is SinFuente {
  return !Array.isArray(x);
}

describe("adaptarBluetooth", () => {
  it("devuelve SinFuente si disponible es false", () => {
    const entrada = entradaBase({ disponible: false, detecciones: [deteccionBase()] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSinFuente(resultado)).toBe(true);
    if (esSinFuente(resultado)) {
      expect(resultado.medio).toBe("bluetooth");
      expect(resultado.motivo).toBe("Bluetooth no disponible o sin permiso");
    }
  });

  it("devuelve SinFuente si disponible es null", () => {
    const entrada = entradaBase({ disponible: null, detecciones: [deteccionBase()] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSinFuente(resultado)).toBe(true);
    if (esSinFuente(resultado)) {
      expect(resultado.medio).toBe("bluetooth");
      expect(resultado.motivo).toBe("Bluetooth no disponible o sin permiso");
    }
  });

  it("devuelve array vacío si no hay detecciones", () => {
    const entrada = entradaBase({ disponible: true, detecciones: [] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSenalesArray(resultado)).toBe(true);
    if (esSenalesArray(resultado)) {
      expect(resultado.length).toBe(0);
    }
  });

  it("convierte una detección BLE con RSSI a SenalEspectro", () => {
    const deteccion = deteccionBase({ rssi: -55, at: AHORA - 5_000 });
    const entrada = entradaBase({ detecciones: [deteccion] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSenalesArray(resultado)).toBe(true);
    if (esSenalesArray(resultado)) {
      expect(resultado.length).toBe(1);

      const senal = resultado[0];
      expect(senal.id).toBe("ble:dev-1");
      expect(senal.medio).toBe("bluetooth");
      expect(senal.banda).toBe("2,4 GHz BLE");
      expect(senal.frecuenciaKhz).toBeNull();
      expect(senal.anchoKhz).toBeNull();
      expect(senal.fuerzaDbm).toBe(-55);
      expect(senal.calidad).toBeCloseTo(0.7857, 3); // qualityFromRssi(-55) = (-55 + 110) / 70 = 55/70 ≈ 0.7857
      expect(senal.origen).toBe("medida");
      expect(senal.capa).toBe("publica");
      expect(senal.fuente).toBe("escaneo BLE");
      expect(senal.medidoEn).toBe(AHORA - 5_000);
      expect(senal.zona).toBeNull();
      expect(senal.compatibles).toEqual([]);
    }
  });

  it("convierte una detección BLE SIN RSSI (viaPicker)", () => {
    const deteccion = deteccionBase({ rssi: null, viaPicker: true, at: AHORA - 2_000 });
    const entrada = entradaBase({ detecciones: [deteccion] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSenalesArray(resultado)).toBe(true);
    if (esSenalesArray(resultado)) {
      expect(resultado.length).toBe(1);

      const senal = resultado[0];
      expect(senal.fuerzaDbm).toBeNull();
      expect(senal.calidad).toBeNull();
      expect(senal.origen).toBe("estimada");
      expect(senal.fuente).toBe("selector de dispositivos BLE");
    }
  });

  it("el nombre del dispositivo NO aparece en la señal pública", () => {
    const deteccion = deteccionBase({ name: "Dispositivo Secreto", rssi: -60 });
    const entrada = entradaBase({ detecciones: [deteccion] });
    const resultado = adaptarBluetooth(entrada);

    expect(esSenalesArray(resultado)).toBe(true);
    if (esSenalesArray(resultado)) {
      const senal = resultado[0];

      // Verificar que el nombre no está en ningún campo de la señal
      const senalJson = JSON.stringify(senal);
      expect(senalJson).not.toContain("Dispositivo Secreto");
      expect(senalJson).not.toContain("Secreto");
    }
  });

  it("convierte múltiples detecciones", () => {
    const detecciones = [
      deteccionBase({ id: "dev-1", rssi: -50, at: AHORA - 1_000 }),
      deteccionBase({ id: "dev-2", rssi: -70, at: AHORA - 2_000 }),
      deteccionBase({ id: "dev-3", rssi: null, viaPicker: true, at: AHORA - 3_000 }),
    ];
    const entrada = entradaBase({ detecciones });
    const resultado = adaptarBluetooth(entrada);

    expect(esSenalesArray(resultado)).toBe(true);
    if (esSenalesArray(resultado)) {
      expect(resultado.length).toBe(3);

      expect(resultado[0].id).toBe("ble:dev-1");
      expect(resultado[0].fuerzaDbm).toBe(-50);
      expect(resultado[0].origen).toBe("medida");

      expect(resultado[1].id).toBe("ble:dev-2");
      expect(resultado[1].fuerzaDbm).toBe(-70);

      expect(resultado[2].id).toBe("ble:dev-3");
      expect(resultado[2].fuerzaDbm).toBeNull();
      expect(resultado[2].origen).toBe("estimada");
      expect(resultado[2].fuente).toBe("selector de dispositivos BLE");
    }
  });

  it("calidad correcta para RSSI límite (-110 dBm = 0, -40 dBm = 1)", () => {
    const deteccionMin = deteccionBase({ rssi: -110, at: AHORA });
    const deteccionMax = deteccionBase({ rssi: -40, at: AHORA });

    const rMin = adaptarBluetooth(entradaBase({ detecciones: [deteccionMin] }));
    const rMax = adaptarBluetooth(entradaBase({ detecciones: [deteccionMax] }));

    expect(esSenalesArray(rMin)).toBe(true);
    expect(esSenalesArray(rMax)).toBe(true);
    if (esSenalesArray(rMin) && esSenalesArray(rMax)) {
      expect(rMin[0].calidad).toBeCloseTo(0, 3);
      expect(rMax[0].calidad).toBeCloseTo(1, 3);
    }
  });
});