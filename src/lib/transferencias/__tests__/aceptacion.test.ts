// Test suite para aceptacion.ts (aceptación pura)
// TDD: se prueba cada contrato contractualmente, no cómo se implementa.
import { describe, expect, it } from "vitest";
import { ConfigAceptacion, NeuronaConocida, MetadataEntrada, Entrada, ResultadoAceptacion, aceptarEntrada, actualizarAceptacion, esAceptada, obtenerEntradaEnCuarentena, tieneConfiguracionPorDefecto } from "@/lib/transferencias/aceptacion";

describe("aceptacion", () => {
  // Setup helpers
  function crearNeurona(id: string, sinPreguntar: boolean): NeuronaConocida {
    return { id, aceptacionSinPreguntar: sinPreguntar };
  }

  function crearEntrada(
    id: string,
    nombre: string,
    tamano: number,
    tipoReal: string,
    neurona: string,
    medio: string,
    esReconocida: boolean,
  ): Entrada {
    const metadata: MetadataEntrada = { id, nombre, tamano, tipoReal, neuronaOrigen: neurona, medio };
    return { metadata, esNeuronaReconocida: esReconocida };
  }

  function crearConfig(neuronas: NeuronaConocida[]): ConfigAceptacion {
    return { neuronasConocidas: neuronas };
  }

  describe("aceptarEntrada", () => {
    it("rechaza por defecto por neurona desconocida", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "unknown", "local", false);
      const config = crearConfig([crearNeurona("known", false)]);
      const resultado = aceptarEntrada(entrada, config);
      expect(resultado.aceptado).toBe(false);
      expect(resultado.razon).toContain("desconocida");
    });

    it("acepta sin preguntar por neurona conocida con sinPreguntar true", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const config = crearConfig([crearNeurona("known", true)]);
      const resultado = aceptarEntrada(entrada, config);
      expect(resultado.aceptado).toBe(true);
      expect(resultado.razon).toContain("sin preguntar");
    });

    it("pide pregunta manual por neurona conocida sin sinPreguntar", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const config = crearConfig([crearNeurona("known", false)]);
      const resultado = aceptarEntrada(entrada, config);
      expect(resultado.aceptado).toBe(false);
      expect(resultado.razon).toContain("requiere aprobación manual");
    });

    it("acepta manualmente cuando preguntaManual true", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const config = crearConfig([crearNeurona("known", false)]);
      const resultado = aceptarEntrada(entrada, config, true);
      expect(resultado.aceptado).toBe(true);
      expect(resultado.razon).toContain("Aceptado manualmente");
    });

    it("rechaza manualmente cuando preguntaManual false", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const config = crearConfig([crearNeurona("known", false)]);
      const resultado = aceptarEntrada(entrada, config, false);
      expect(resultado.aceptado).toBe(false);
      expect(resultado.razon).toContain("requiere aprobación manual");
    });
  });

  describe("actualizarAceptacion", () => {
    it("actualiza la entrada con resultado de aceptación", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const resultado: ResultadoAceptacion = { aceptado: true, razon: "Aceptado manualmente" };
      const actualizada = actualizarAceptacion(entrada, resultado);
      expect(actualizada.aceptacion).toEqual({ aceptado: true, razon: "Aceptado manualmente" });
    });
  });

  describe("esAceptada", () => {
    it("devuelve true cuando está aceptada", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      entrada.aceptacion = { aceptado: true, razon: "Aceptado" };
      expect(esAceptada(entrada)).toBe(true);
    });

    it("devuelve false cuando no está aceptada", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      entrada.aceptacion = { aceptado: false, razon: "Rechazado" };
      expect(esAceptada(entrada)).toBe(false);
    });

    it("devuelve false cuando no hay estado de aceptación", () => {
      const entrada = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      expect(esAceptada(entrada)).toBe(false);
    });
  });

  describe("obtenerEntradaEnCuarentena", () => {
    it("devuelve entradas pendientes de aceptación", () => {
      const e1 = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      e1.aceptacion = { aceptado: false, razon: "Rechazado" };
      const e2 = crearEntrada("e2", "test2.txt", 2048, "text/plain", "known", "local", true);
      e2.aceptacion = { aceptado: true, razon: "Aceptado" };
      const pendientes = obtenerEntradaEnCuarentena([e1, e2]);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].metadata.id).toBe("e1");
    });

    it("devuelve entradas sin estado de aceptación como en cuarentena", () => {
      const e1 = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      const pendientes = obtenerEntradaEnCuarentena([e1]);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].metadata.id).toBe("e1");
    });

    it("devuelve entradas vacías cuando todas están aceptadas", () => {
      const e1 = crearEntrada("e1", "test.txt", 1024, "text/plain", "known", "local", true);
      e1.aceptacion = { aceptado: true, razon: "Aceptado" };
      const pendientes = obtenerEntradaEnCuarentena([e1]);
      expect(pendientes).toHaveLength(0);
    });
  });

  describe("tieneConfiguracionPorDefecto", () => {
    it("devuelve true cuando hay al menos una sinPreguntar y las demás preguntan", () => {
      const config = crearConfig([
        crearNeurona("n1", true),
        crearNeurona("n2", false),
        crearNeurona("n3", false),
      ]);
      expect(tieneConfiguracionPorDefecto(config)).toBe(true);
    });

    it("devuelve false cuando todas preguntan", () => {
      const config = crearConfig([
        crearNeurona("n1", false),
        crearNeurona("n2", false),
      ]);
      expect(tieneConfiguracionPorDefecto(config)).toBe(false);
    });

    it("devuelve true cuando hay solo una sinPreguntar", () => {
      const config = crearConfig([crearNeurona("n1", true)]);
      expect(tieneConfiguracionPorDefecto(config)).toBe(true);
    });
  });
});