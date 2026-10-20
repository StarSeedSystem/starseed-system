/**
 * Protomolécula · PRUEBAS DEL ADAPTADOR DE WEARABLES.
 * Solo pruebas de funciones puras: entrada → salida.
 * PROHIBIDO usar vi.mock de módulos de Node o importar route.ts.
 */
import { describe, it, expect } from "vitest";
import {
  analizarTramaPulso,
  procesarPulso,
  crearVinculoPulso,
  RANGO_PULSO,
  SERVICIO_PULSO,
  CARACTERISTICA_PULSO,
} from "../adaptador-wearable";
import type { Parametro, Autor } from "../tipos";

describe("adaptador-wearable", () => {
  const autor: Autor = { tipo: "persona", id: "usuario-test", nombre: "Usuario Test" };
  const ahora = Date.now();

  describe("analizarTramaPulso", () => {
    it("debe analizar correctamente trama de 8 bits sin contacto", () => {
      // Trama: flags=0x00 (8-bit, sin contacto soportado), valor=60 bpm
      const trama = new Uint8Array([0x00, 60]);
      const resultado = analizarTramaPulso(new DataView(trama.buffer));
      expect(resultado).toBe(60);
    });

    it("debe analizar correctamente trama de 16 bits con contacto detectado", () => {
      // Trama: flags=0x07 (16-bit, contacto soportado y detectado), valor=120 bpm
      const trama = new Uint8Array([0x07, 0x78, 0x00]); // 120 en little endian
      const resultado = analizarTramaPulso(new DataView(trama.buffer));
      expect(resultado).toBe(120);
    });

    it("debe devolver null cuando el contacto es soportado pero no detectado", () => {
      // Trama: flags=0x02 (contacto soportado pero no detectado), valor=80 bpm
      const trama = new Uint8Array([0x02, 80]);
      const resultado = analizarTramaPulso(new DataView(trama.buffer));
      expect(resultado).toBeNull();
    });

    it("debe devolver null por trama demasiado corta", () => {
      const trama = new Uint8Array([0x00]); // Solo flags, sin valor
      const resultado = analizarTramaPulso(new DataView(trama.buffer));
      expect(resultado).toBeNull();
    });

    it("debe ignorar bytes adicionales después del valor de pulso", () => {
      // Trama: flags=0x00 (8-bit), valor=70 bpm, seguido de bytes de energía gastada
      const trama = new Uint8Array([0x00, 70, 0x10, 0x27, 0x00, 0x00]); // 10000 joules en little endian
      const resultado = analizarTramaPulso(new DataView(trama.buffer));
      expect(resultado).toBe(70);
    });
  });

  describe("procesarPulso", () => {
    const parametro: Parametro = {
      id: "pulso-param",
      nombre: "Pulso",
      tipo: "numero",
      min: RANGO_PULSO.min,
      max: RANGO_PULSO.max,
    };

    it("debe generar operación cuando el valor está en rango", () => {
      const bruto = 65;
      const { operacion } = procesarPulso(bruto, parametro, autor, ahora, "op-test");
      expect(operacion).not.toBeNull();
      expect(operacion?.accion).toEqual({ tipo: "exacta", valor: 65 });
      expect(operacion?.fuente).toBe("wearable:pulso");
      expect(operacion?.origen).toBe("sensor");
    });

    it("no debe generar operación cuando el valor está debajo del rango mínimo", () => {
      const bruto = RANGO_PULSO.min - 1; // 39 bpm
      const { operacion } = procesarPulso(bruto, parametro, autor, ahora, "op-test");
      expect(operacion).toBeNull();
    });

    it("no debe generar operación cuando el valor está encima del rango máximo", () => {
      const bruto = RANGO_PULSO.max + 1; // 181 bpm
      const { operacion } = procesarPulso(bruto, parametro, autor, ahora, "op-test");
      expect(operacion).toBeNull();
    });

    it("debe respetar el rango personalizado del parámetro", () => {
      const parametroPersonalizado: Parametro = {
        ...parametro,
        min: 50,
        max: 120,
      };
      
      // Valor dentro del rango personalizado
      let { operacion } = procesarPulso(60, parametroPersonalizado, autor, ahora, "op-test");
      expect(operacion).not.toBeNull();
      
      // Valor fuera del rango personalizado pero dentro del rango por defecto
      operacion = procesarPulso(130, parametroPersonalizado, autor, ahora, "op-test").operacion;
      expect(operacion).toBeNull();
    });
  });

  describe("crearVinculoPulso", () => {
    it("debe crear un vínculo de control con el tipo sensor correcto", () => {
      const parametro: Parametro = {
        id: "pulso-param",
        nombre: "Pulso",
        tipo: "numero",
      };
      
      const vinculo = crearVinculoPulso("vinculo-test", parametro, "usuario-test");
      expect(vinculo).toEqual({
        tipo: "sensor",
        sensorId: "wearable:pulso",
      });
    });
  });
});