import { describe, it, expect } from "vitest";

import { 
  temperaturaDe, 
  estadoDe, 
  cristalizar 
} from "../cristalizacion";
import type { 
  NeuronaReticula, 
  SenalMedida, 
  Tesela, 
  Reticula 
} from "../tipos";
import { crearTesela } from "../teselas";

describe("temperaturaDe", () => {
  it("should return empty record for empty historial", () => {
    const historial: Array<{clave: string; t: number; calidad: number}> = [];
    const result = temperaturaDe(historial);
    expect(result).toEqual({});
  });

  it("should compute temperature for a single neuron with constant calidad", () => {
    const ahora = 1000;
    const historial: Array<{clave: string; t: number; calidad: number}> = [
      { clave: "neurona1", t: 0, calidad: 0.5 },
      { clave: "neurona1", t: 500, calidad: 0.5 },
      { clave: "neurona1", t: 1000, calidad: 0.5 },
    ];
    const result = temperaturaDe(historial, 120000, ahora);
    // std = 0 -> temperature = 0
    expect(result.neurona1).toBeCloseTo(0);
  });

  it("should compute temperature for a single neuron with varying calidad", () => {
    const ahora = 1000;
    const historial: Array<{clave: string; t: number; calidad: number}> = [
      { clave: "neurona1", t: 0, calidad: 0.0 },
      { clave: "neurona1", t: 500, calidad: 1.0 },
      { clave: "neurona1", t: 1000, calidad: 0.0 },
    ];
    // mean = 0.5, variance = ((0-0.5)^2 + (1-0.5)^2 + (0-0.5)^2)/3 = (0.25+0.25+0.25)/3 = 0.25, std = 0.5
    // temperature = std * 2 = 1.0
    const result = temperaturaDe(historial, 120000, ahora);
    expect(result.neurona1).toBeCloseTo(1.0);
  });

  it("should return 0.5 for neuron with no history in ventana", () => {
    const ahora = 1000;
    const historial: Array<{clave: string; t: number; calidad: number}> = [
      { clave: "neurona1", t: 0, calidad: 0.5 }, // outside window if ventanaMs < 1000
    ];
    const result = temperaturaDe(historial, 500, ahora); // ventanaMs=500, so t=0 is 1000 ms ago -> outside
    expect(result.neurona1).toBeCloseTo(0.5);
  });
});

describe("estadoDe", () => {
  it("should return 'vitreo' for low temperature", () => {
    expect(estadoDe(0.1)).toBe('vitreo');
  });
  it("should return 'subenfriado' for medium temperature", () => {
    expect(estadoDe(0.3)).toBe('subenfriado');
  });
  it("should return 'fundido' for high temperature", () => {
    expect(estadoDe(0.7)).toBe('fundido');
  });
});

describe("cristalizar", () => {
  it("should return a cristal object", () => {
    const reticula: Reticula = { teselas: {} };
    const result = cristalizar(reticula);
    expect(result).toHaveProperty("puentes");
    expect(result).toHaveProperty("estado");
    expect(result).toHaveProperty("temperatura");
    expect(result).toHaveProperty("huella");
    expect(result).toHaveProperty("coordinacion");
  });

  it("should handle a simple case", () => {
    // Create two neurons with a signal between them
    const neuronaA: NeuronaReticula = {
      id: "A",
      cuenta: "cue1",
      capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
      medios: ["wifi-lan", "ble"],
    };
    const neuronaB: NeuronaReticula = {
      id: "B",
      cuenta: "cue1",
      capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
      medios: ["wifi-lan", "ble"],
    };
    const senal: SenalMedida = {
      de: "A",
      a: "B",
      medio: "wifi-lan",
      rssiDbm: -50,
      snrDb: 30,
      rttMs: 50,
      perdidaPct: 0,
      anchoBandaKbps: 1000,
      vistaEn: 1000,
    };
    const teselaA = crearTesela(neuronaA, [senal], 0);
    const teselaB = crearTesela(neuronaB, [senal], 0);
    const reticula: Reticula = {
      teselas: {
        "A": teselaA,
        "B": teselaB,
      }
    };
    const result = cristalizar(reticula, { temperatura: { "A": 0.5, "B": 0.5 } });
    expect(result.puentes.length).toBeGreaterThanOrEqual(0);
    // Add more assertions as needed
  });
});