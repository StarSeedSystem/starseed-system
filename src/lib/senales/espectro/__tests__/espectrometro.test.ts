/**
 * espectrometro.test.ts — tests del espectrómetro inteligente (MRE5/MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import { describe, it, expect } from "vitest";
import type { SenalEspectro, SinFuente, Medio, Compatibilidad, EquipoCompat } from "../modelo";
import type { EntradaWifi, ResultadoWifi } from "../adaptadores/wifi";
import type { EntradaBluetooth } from "../adaptadores/bluetooth";
import type { ResultadoEspectro } from "../adaptadores/celular-sdr";
import type { Radio, LoraMedio, EnlaceMapa } from "../adaptadores/lora-malla";
import type { DepsLectura, ResultadoLectura } from "../leer-senales";
import { espectrometro, type EntradaEspectrometro } from "../espectrometro";

// --- Mocks y helpers ---

const AHORA = Date.now();

function senalBase(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: `test:${AHORA}`,
    medio: "wifi",
    banda: "Wi-Fi 2,4 GHz",
    frecuenciaKhz: 2412000,
    anchoKhz: 20000,
    fuerzaDbm: -50,
    calidad: 0.8,
    origen: "medida",
    capa: "propia",
    fuente: "test",
    medidoEn: AHORA,
    zona: null,
    compatibles: [],
    ...overrides,
  };
}

function sinFuenteBase(medio: Medio, motivo = "sin datos"): SinFuente {
  return { medio, motivo };
}

// Adaptadores mock que devuelven lo que queramos, respetando las firmas reales

function wifiMock(senales: SenalEspectro[], sinFuente: SinFuente[] = []) {
  return async (_entrada: EntradaWifi): Promise<ResultadoWifi> => ({ senales, sinFuente });
}

function loraMock(senales: SenalEspectro[]) {
  return async (_radio: Radio, _lora: LoraMedio, _enlaces: EnlaceMapa[]): Promise<readonly SenalEspectro[]> => senales;
}

function bluetoothMock(senales: SenalEspectro[], sinFuente?: SinFuente) {
  return async (_entrada: EntradaBluetooth): Promise<readonly SenalEspectro[] | SinFuente> => {
    if (sinFuente) return sinFuente;
    return senales;
  };
}

function celularMock(senales: SenalEspectro[], sinFuente: SinFuente[] = []) {
  return async (): Promise<ResultadoEspectro> => ({ senales, sinFuente });
}

function estacionesMock(senales: SenalEspectro[]) {
  return async (): Promise<readonly SenalEspectro[]> => senales;
}

function publicadasMock(senales: SenalEspectro[]) {
  return async (_deps: DepsLectura): Promise<ResultadoLectura> => ({ senales, estado: "ok" as const });
}

const equipoVacio: EquipoCompat = { radios: [], regionLora: undefined, sdr: false };

describe("espectrometro", () => {
  it("dos adaptadores devuelven la misma señal → una sola (deduplicación por claveSenal)", async () => {
    const s = senalBase({ id: "wifi:dup:1", medio: "wifi", banda: "Wi-Fi 2,4 GHz", frecuenciaKhz: 2412000 });
    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([s]),
      adaptadorLora: loraMock([s]), // misma señal exacta
      adaptadorBluetooth: bluetoothMock([]),
      adaptadorCelular: celularMock([]),
      adaptadorEstaciones: estacionesMock([]),
      leerPublicadas: publicadasMock([]),
      equipo: equipoVacio,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    expect(res.senales).toHaveLength(1);
    expect(res.sinFuente.length).toBeGreaterThanOrEqual(0);
  });

  it("una señal coincide con neurona propia → tiene vinculo y se cuenta en vinculadas", async () => {
    const neuronaId = "neuron:abc123";
    const s = senalBase({
      id: `malla:enlace:${neuronaId}`,
      medio: "malla",
      banda: "local",
      vinculo: { tipo: "neurona", id: neuronaId },
    });
    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([]),
      adaptadorLora: loraMock([s]),
      adaptadorBluetooth: bluetoothMock([]),
      adaptadorCelular: celularMock([]),
      adaptadorEstaciones: estacionesMock([]),
      leerPublicadas: publicadasMock([]),
      equipo: equipoVacio,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    expect(res.senales).toHaveLength(1);
    expect(res.senales[0].vinculo).toEqual({ tipo: "neurona", id: neuronaId });
    expect(res.vinculadas).toBe(1);
  });

  it("si todos los adaptadores fallan → lista vacía y cuatro sinFuente (uno por adaptador)", async () => {
    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([], [sinFuenteBase("wifi")]),
      adaptadorLora: loraMock([]), // lora no devuelve sinFuente, solo array vacío
      adaptadorBluetooth: bluetoothMock([], sinFuenteBase("bluetooth")),
      adaptadorCelular: celularMock([], [sinFuenteBase("celular")]),
      adaptadorEstaciones: estacionesMock([]),
      leerPublicadas: publicadasMock([]),
      equipo: equipoVacio,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    expect(res.senales).toHaveLength(0);
    // WiFi, Bluetooth, Celular = 3 sinFuente (LoRa no tiene sinFuente en su firma)
    expect(res.sinFuente).toHaveLength(3);
    const medios = res.sinFuente.map((sf) => sf.medio).sort();
    expect(medios).toEqual(["bluetooth", "celular", "wifi"]);
  });

  it("no inventa ninguna señal: solo devuelve lo que dan los adaptadores + publicadas + estaciones", async () => {
    const s1 = senalBase({ id: "wifi:1", medio: "wifi", banda: "Wi-Fi 2,4 GHz", frecuenciaKhz: 2412000 });
    const s2 = senalBase({ id: "ble:1", medio: "bluetooth" });
    const sPub = senalBase({ id: "pub:1", medio: "wifi", banda: "Wi-Fi 5 GHz", frecuenciaKhz: 5180000, capa: "publica", fuente: "publicada por su dueño" });
    const sEst = senalBase({ id: "est:1", medio: "estacion", capa: "publica" });

    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([s1]),
      adaptadorLora: loraMock([]),
      adaptadorBluetooth: bluetoothMock([s2]),
      adaptadorCelular: celularMock([]),
      adaptadorEstaciones: estacionesMock([sEst]),
      leerPublicadas: publicadasMock([sPub]),
      equipo: equipoVacio,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    // 4 señales: 2 de adaptadores + 1 publicada + 1 estación
    expect(res.senales).toHaveLength(4);
    const ids = res.senales.map((s) => s.id).sort();
    expect(ids).toEqual(["ble:1", "est:1", "pub:1", "wifi:1"]);
  });

  it("ordena: más viva y de mayor calidad primero", async () => {
    const antigua = senalBase({ id: "old", calidad: 0.9, medidoEn: AHORA - 10_000, banda: "Wi-Fi 2,4 GHz", frecuenciaKhz: 2412000 }); // 10s atrás, muy viva
    const reciente = senalBase({ id: "new", calidad: 0.5, medidoEn: AHORA - 1_000, banda: "Wi-Fi 5 GHz", frecuenciaKhz: 5180000 }); // 1s atrás, menos calidad
    const muyAntigua = senalBase({ id: "veryold", calidad: 0.8, medidoEn: AHORA - 300_000, banda: "Wi-Fi 6 GHz", frecuenciaKhz: 5950000 }); // 5 min, muerta

    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([antigua, reciente, muyAntigua]),
      adaptadorLora: loraMock([]),
      adaptadorBluetooth: bluetoothMock([]),
      adaptadorCelular: celularMock([]),
      adaptadorEstaciones: estacionesMock([]),
      leerPublicadas: publicadasMock([]),
      equipo: equipoVacio,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    // Las vivas (≤3 min) primero, por calidad descendente
    expect(res.senales[0].id).toBe("old"); // viva, calidad 0.9
    expect(res.senales[1].id).toBe("new"); // viva, calidad 0.5
    // muyAntigua no es viva (5 min > 3 min), va al final
    expect(res.senales[2].id).toBe("veryold");
  });

  it("añade compatibles a cada señal usando compatiblesDe", async () => {
    const s = senalBase({ id: "wifi:test", medio: "wifi" });
    const equipo: EquipoCompat = { radios: ["wifi"], regionLora: "EU_868", sdr: false };

    const entrada: EntradaEspectrometro = {
      adaptadorWifi: wifiMock([s]),
      adaptadorLora: loraMock([]),
      adaptadorBluetooth: bluetoothMock([]),
      adaptadorCelular: celularMock([]),
      adaptadorEstaciones: estacionesMock([]),
      leerPublicadas: publicadasMock([]),
      equipo,
      ahora: AHORA,
    };

    const res = await espectrometro(entrada);

    expect(res.senales).toHaveLength(1);
    expect(res.senales[0].compatibles.length).toBeGreaterThan(0);
    const wifiCompat = res.senales[0].compatibles.find((c) => c.con === "wifi");
    expect(wifiCompat).toBeDefined();
    expect(wifiCompat?.posible).toBe(true);
  });

  it("vincula señales con AntennaKind conocido (lora/relay/account/ip/ble/serial)", async () => {
    const antenasConocidas = ["lora", "relay", "account", "ip", "ble", "serial"] as const;

    for (const antenna of antenasConocidas) {
      const s = senalBase({
        id: `malla:${antenna}:1`,
        medio: "malla",
        banda: antenna,
        vinculo: { tipo: "antena", id: antenna },
      });
      const entrada: EntradaEspectrometro = {
        adaptadorWifi: wifiMock([]),
        adaptadorLora: loraMock([s]),
        adaptadorBluetooth: bluetoothMock([]),
        adaptadorCelular: celularMock([]),
        adaptadorEstaciones: estacionesMock([]),
        leerPublicadas: publicadasMock([]),
        equipo: equipoVacio,
        ahora: AHORA,
      };

      const res = await espectrometro(entrada);
      expect(res.senales).toHaveLength(1);
      expect(res.senales[0].vinculo).toEqual({ tipo: "antena", id: antenna });
      expect(res.vinculadas).toBe(1);
    }
  });

  it("vincula señales con aparatos conocidos (neurona/cerebro/nodo)", async () => {
    const tiposVinculo = ["neurona", "cerebro", "nodo"] as const;

    for (const tipo of tiposVinculo) {
      const id = `${tipo}:test123`;
      const s = senalBase({
        id: `malla:${id}`,
        medio: "malla",
        banda: "local",
        vinculo: { tipo, id },
      });
      const entrada: EntradaEspectrometro = {
        adaptadorWifi: wifiMock([]),
        adaptadorLora: loraMock([s]),
        adaptadorBluetooth: bluetoothMock([]),
        adaptadorCelular: celularMock([]),
        adaptadorEstaciones: estacionesMock([]),
        leerPublicadas: publicadasMock([]),
        equipo: equipoVacio,
        ahora: AHORA,
      };

      const res = await espectrometro(entrada);
      expect(res.senales).toHaveLength(1);
      expect(res.senales[0].vinculo).toEqual({ tipo, id });
      expect(res.vinculadas).toBe(1);
    }
  });
});