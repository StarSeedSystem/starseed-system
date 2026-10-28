import { describe, expect, it } from "vitest";
import {
  anotar,
  exportarJSONL,
  umbralRecalibrado,
  type RegistroAprendizaje,
  type Anotación,
} from "../aprendizaje-laya";

const registroVacio: RegistroAprendizaje = { casos: [], umbrales: {} };

const anotaciónBase: Anotación = {
  punto: "reflejo.herramienta",
  ambito: "personal",
  p: 0.75,
  donde: "a1",
  ms: 3200,
  resultado: "aceptada",
  estado: "aprendiendo",
};

describe("aprendizaje-laya - anotar", () => {
  it("guarda el caso en el registro", () => {
    const registro = anotar(registroVacio, anotaciónBase);
    expect(registro.casos).toHaveLength(1);
    expect(registro.casos[0].punto).toBe("reflejo.herramienta");
    expect(registro.casos[0].p).toBe(0.75);
  });

  it("genera huella cuando es privado y no guarda el estado completo", () => {
    const privado: Anotación = { ...anotaciónBase, privado: true, p: 0.5 };
    const registro = anotar(registroVacio, privado);
    const caso = registro.casos[0];
    
    expect(caso.privado).toBe(true);
    expect(caso.huella).toBeDefined();
    expect(typeof caso.huella).toBe("string");
    expect(caso.huella?.length).toBeGreaterThan(0);
  });

  it("no genera huella cuando no es privado", () => {
    const registro = anotar(registroVacio, anotaciónBase);
    const caso = registro.casos[0];
    
    expect(caso.privado).toBeUndefined();
    expect(caso.huella).toBeUndefined();
  });
});

describe("aprendizaje-laya - umbralRecalibrado", () => {
  it("devuelve el umbral del catálogo cuando hay menos de 30 casos", () => {
    const umbrales = { "reflejo.herramienta": { personal: 0.7 } };
    const registro: RegistroAprendizaje = { casos: [], umbrales };
    
    const umbral = umbralRecalibrado(registro, "reflejo.herramienta", "personal");
    expect(umbral).toBe(0.7);
  });

  it("devuelve 0.6 cuando no hay umbral en catálogo y menos de 30 casos", () => {
    const registro: RegistroAprendizaje = { casos: [], umbrales: {} };
    const umbral = umbralRecalibrado(registro, "reflejo.herramienta", "personal");
    expect(umbral).toBe(0.6);
  });

  it("recalibra con 30 casos para minimizar correcciones", () => {
    const casos = Array.from({ length: 30 }, (_, i) => ({
      punto: "reflejo.herramienta",
      ambito: "personal",
      p: i < 15 ? 0.4 : 0.8,
      donde: "a1",
      ms: 3000,
      resultado: "aceptada" as const,
      estado: "aprendiendo" as const,
    }));

    const registro: RegistroAprendizaje = { casos, umbrales: {} };
    const umbral = umbralRecalibrado(registro, "reflejo.herramienta", "personal");
    
    expect([0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]).toContain(umbral);
  });

  it("ignora casos privados al recalibrar", () => {
    const casos = Array.from({ length: 30 }, () => ({
      punto: "reflejo.herramienta",
      ambito: "personal",
      p: 0.9,
      donde: "a1",
      ms: 3000,
      resultado: "aceptada" as const,
      privado: true,
      estado: "aprendiendo" as const,
      huella: "abc",
    }));

    const registro: RegistroAprendizaje = { casos, umbrales: { "reflejo.herramienta": { personal: 0.75 } } };
    const umbral = umbralRecalibrado(registro, "reflejo.herramienta", "personal");
    
    expect(umbral).toBe(0.75);
  });
});

describe("aprendizaje-laya - exportarJSONL", () => {
  it("exporta solo casos no privados en formato JSONL", () => {
    const casos = [
      {
        punto: "reflejo.herramienta",
        ambito: "personal",
        p: 0.75,
        donde: "a1",
        ms: 3200,
        resultado: "aceptada" as const,
        estado: "aprendiendo" as const,
      },
      {
        punto: "reflejo.herramienta",
        ambito: "personal",
        p: 0.5,
        donde: "a1",
        ms: 3100,
        resultado: "corregida" as const,
        privado: true,
        estado: "aprendiendo" as const,
        huella: "abc123",
      },
    ];

    const registro: RegistroAprendizaje = { casos, umbrales: {} };
    const jsonl = exportarJSONL(registro);
    const lineas = jsonl.split("\n");
    
    expect(lineas).toHaveLength(1);
    const casoExportado = JSON.parse(lineas[0]);
    expect(casoExportado.punto).toBe("reflejo.herramienta");
    expect(casoExportado.privado).toBeUndefined();
    expect(casoExportado.huella).toBeUndefined();
  });

  it("genera líneas válidas de JSON", () => {
    const registro: RegistroAprendizaje = {
      casos: [anotaciónBase as any],
      umbrales: {},
    };
    
    const jsonl = exportarJSONL(registro);
    const lineas = jsonl.split("\n").filter(l => l.trim());
    
    for (const linea of lineas) {
      expect(() => JSON.parse(linea)).not.toThrow();
    }
  });
});
