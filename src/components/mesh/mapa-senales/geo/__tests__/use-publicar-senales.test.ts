import { describe, it, expect } from "vitest";
import { senalesMedioAFilasPublicables, type EntradaPublicacion } from "../use-publicar-senales";

const AHORA = 1_700_000_000_000;
const DEVICE_ID = "neuron-abc123";
const MEDIO_ID = "medium-wifi-1";
const MEDIO_TIPO = "wifi";
const MEDIO_ETIQUETA = "Wi-Fi del escritorio";

function entradaBase(overrides: Partial<EntradaPublicacion> = {}): EntradaPublicacion {
  return {
    deviceId: DEVICE_ID,
    medioId: MEDIO_ID,
    medioTipo: MEDIO_TIPO,
    medioEtiqueta: MEDIO_ETIQUETA,
    senales: {
      internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
      malla: { pares: 2, otrasCuentas: 1, sinInternet: 0 },
      lora: { estado: "sin-radio", nodos: 0 },
      bluetooth: { disponible: true },
      serie: { disponible: false, puertos: 0 },
      reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
    },
    ahora: AHORA,
    ...overrides,
  };
}

describe("senalesMedioAFilasPublicables", () => {
  it("devuelve array vacío si no hay señales", () => {
    const entrada = entradaBase({
      senales: {
        internet: { enLinea: false },
        malla: { pares: 0, otrasCuentas: 0 },
        lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: false },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
      },
    });

    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    expect(resultado).toEqual([]);
  });

  it("publica solo la capa solicitada (publica)", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    expect(resultado.length).toBeGreaterThan(0);
    for (const fila of resultado) {
      expect(fila.capa).toBe("publica");
      expect(fila.device_id).toBe(DEVICE_ID);
      expect(typeof fila.frecuencia_khz).toBe("number");
      expect(typeof fila.ancho_khz).toBe("number");
      expect(typeof fila.fuerza_dbm).toBe("number");
      expect(typeof fila.calidad).toBe("number");
      expect(["medida", "declarada", "estimada"]).toContain(fila.origen);
      expect(typeof fila.medido_en).toBe("string");
    }
    // Verifica que hay filas para los medios activos
    const medios = new Set(resultado.map((f) => f.medio));
    expect(medios.has("wifi")).toBe(true);
    expect(medios.has("bluetooth")).toBe(true);
    expect(medios.has("malla")).toBe(true);
  });

  it("publica solo la capa solicitada (comunidad)", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["comunidad"]);

    for (const fila of resultado) {
      expect(fila.capa).toBe("comunidad");
    }
  });

  it("publica solo la capa solicitada (privada)", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["privada"]);

    for (const fila of resultado) {
      expect(fila.capa).toBe("privada");
    }
  });

  it("no publica nada si la capa no está en la lista de habilitadas", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    for (const fila of resultado) {
      expect(fila.capa).not.toBe("comunidad");
      expect(fila.capa).not.toBe("privada");
    }
  });

  it("publica múltiples capas si están habilitadas", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica", "comunidad", "privada"]);

    const capas = new Set(resultado.map((f) => f.capa));
    expect(capas.has("publica")).toBe(true);
    expect(capas.has("comunidad")).toBe(true);
    expect(capas.has("privada")).toBe(true);
  });

  it("internet en línea genera fila con medio internet", () => {
    const entrada = entradaBase({
      senales: {
        internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
        malla: { pares: 0, otrasCuentas: 0 },
        lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: false },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
      },
    });

    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    const filaInternet = resultado.find((f) => f.medio === "internet");
    expect(filaInternet).toBeDefined();
    expect(filaInternet?.origen).toBe("medida");
    expect(filaInternet?.fuerza_dbm).toBeGreaterThan(-100);
    expect(filaInternet?.calidad).toBeGreaterThan(0);
  });

  it("bluetooth disponible genera fila con medio bluetooth", () => {
    const entrada = entradaBase({
      senales: {
        internet: { enLinea: false },
        malla: { pares: 0, otrasCuentas: 0 },
        lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: true },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
      },
    });

    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    const filaBle = resultado.find((f) => f.medio === "bluetooth");
    expect(filaBle).toBeDefined();
    expect(filaBle?.origen).toBe("declarada");
  });

  it("lora conectada genera fila con medio lora", () => {
    const entrada = entradaBase({
      senales: {
        internet: { enLinea: false },
        malla: { pares: 0, otrasCuentas: 0 },
        lora: { estado: "ready", transporte: "serial", nodos: 3 },
        bluetooth: { disponible: false },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
      },
    });

    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    const filaLora = resultado.find((f) => f.medio === "lora");
    expect(filaLora).toBeDefined();
    expect(filaLora?.origen).toBe("medida");
    expect(filaLora?.banda).toContain("LoRa");
  });

  it("malla con pares genera fila con medio malla", () => {
    const entrada = entradaBase({
      senales: {
        internet: { enLinea: false },
        malla: { pares: 2, otrasCuentas: 1, sinInternet: 0 },
        lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: false },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
      },
    });

    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    const filaMalla = resultado.find((f) => f.medio === "malla");
    expect(filaMalla).toBeDefined();
    expect(filaMalla?.origen).toBe("medida");
  });

  it("comunidad nula para capas publica y privada", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica", "privada"]);

    for (const fila of resultado) {
      expect(fila.comunidad).toBeNull();
    }
  });

  it("comunidad con valor para capa comunidad", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["comunidad"]);

    for (const fila of resultado) {
      expect(fila.comunidad).toBe("comunidad");
    }
  });

  it("zonas son null (nunca coordenadas exactas)", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    for (const fila of resultado) {
      expect(fila.zona).toBeNull();
    }
  });

  it("ficha es null (sin contenido personal)", () => {
    const entrada = entradaBase();
    const resultado = senalesMedioAFilasPublicables(entrada, ["publica"]);

    for (const fila of resultado) {
      expect(fila.ficha).toBeNull();
    }
  });
});