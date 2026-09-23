import { describe, expect, it } from "vitest";
import {
  PUERTO,
  HOST,
  MIN_RAM_MB,
  verificarCarga,
  conversacionEnCurso,
  obtenerRamLibreMb,
} from "../../../native/laya/servidor-laya.mjs";

describe("Laya Servidor Local", () => {
  it("exporta la configuración por defecto correcta", () => {
    expect(PUERTO).toBe(4470);
    expect(HOST).toBe("127.0.0.1");
    expect(MIN_RAM_MB).toBe(2500);
  });

  it("rechaza la carga si la RAM libre es menor a 2500 MB", () => {
    const res = verificarCarga(2000, false, false);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("sin RAM para Laya");
  });

  it("rechaza la carga si hay conversación en curso sin cabecera de prioridad", () => {
    const res = verificarCarga(3500, true, false);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("conversación en curso");
  });

  it("permite la carga con conversación en curso si lleva X-Prioridad: conversacion", () => {
    const res = verificarCarga(3500, true, true);
    expect(res.ok).toBe(true);
  });

  it("permite la carga cuando hay suficiente RAM y no hay conversación activa", () => {
    const res = verificarCarga(3500, false, false);
    expect(res.ok).toBe(true);
  });

  it("conversacionEnCurso devuelve false cuando el archivo no existe", () => {
    const enCurso = conversacionEnCurso(Date.now(), "/tmp/archivo-inexistente-starseed.json");
    expect(enCurso).toBe(false);
  });

  it("obtenerRamLibreMb devuelve un valor numérico positivo", () => {
    const ram = obtenerRamLibreMb();
    expect(typeof ram).toBe("number");
    expect(ram).toBeGreaterThan(0);
  });
});

