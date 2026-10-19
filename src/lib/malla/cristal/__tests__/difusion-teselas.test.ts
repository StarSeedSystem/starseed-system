import { describe, it, expect, vi } from "vitest";

import {
  SOBRE,
  sobreDeTesela,
  teselaDeSobre,
  deltaParaLora,
  crearDifusor,
} from "../difusion-teselas";
import type { Tesela, NeuronaReticula, SenalMedida } from "../tipos";

describe("difusion-teselas", () => {
  const neurona: NeuronaReticula = {
    id: "n1",
    cuenta: "c1",
    esRouter: false,
    capacidad: {
      ramGb: 8,
      bateriaPct: 80,
      cargando: false,
    },
    medios: ["webrtc"],
  };

  const senal: SenalMedida = {
    de: "n1",
    a: "n2",
    medio: "webrtc",
    rssiDbm: -50.3,
    snrDb: 10.7,
    rttMs: 20,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    vistaEn: Date.now(),
  };

  const tesela: Tesela = {
    origen: "n1",
    reloj: 1,
    neurona,
    senales: [senal],
  };

  describe("SOBRE", () => {
    it("should be the constant string", () => {
      expect(SOBRE).toBe("cristal.tesela");
    });
  });

  describe("sobreDeTesela", () => {
    it("should create a valid over JSON string", () => {
      const firma = "signature123";
      const over = sobreDeTesela(tesela, firma);
      expect(typeof over).toBe("string");
      const parsed = JSON.parse(over);
      expect(parsed.tipo).toBe(SOBRE);
      expect(parsed.v).toBe(1);
      expect(parsed.t).toEqual({ ...tesela, firma });
    });
  });

  describe("teselaDeSobre", () => {
    it("should return null for invalid JSON", () => {
      expect(teselaDeSobre("invalid json")).toBeNull();
    });

    it("should return null for missing tipo", () => {
      const over = JSON.stringify({ v: 1, t: tesela });
      expect(teselaDeSobre(over)).toBeNull();
    });

    it("should return null for wrong tipo", () => {
      const over = JSON.stringify({ tipo: "wrong", v: 1, t: tesela });
      expect(teselaDeSobre(over)).toBeNull();
    });

    it("should return null for missing v", () => {
      const over = JSON.stringify({ tipo: SOBRE, t: tesela });
      expect(teselaDeSobre(over)).toBeNull();
    });

    it("should return null for wrong v", () => {
      const over = JSON.stringify({ tipo: SOBRE, v: 2, t: tesela });
      expect(teselaDeSobre(over)).toBeNull();
    });

    it("should return the tesela for a valid over", () => {
      const firma = "signature123";
      const over = sobreDeTesela(tesela, firma);
      const result = teselaDeSobre(over);
      expect(result).toEqual({ ...tesela, firma });
    });
  });

  describe("deltaParaLora", () => {
    it("should return empty string when previa is null", () => {
      expect(deltaParaLora(null, tesela)).toBe("");
    });

    it("should return empty string when no changes", () => {
      const previa = { ...tesela };
      expect(deltaParaLora(previa, tesela)).toBe("");
    });

    it("should detect changes in rssi and return the correct delta format", () => {
      const previa = { ...tesela, senales: [{ ...senal, rssiDbm: -60.2 }] };
      const nuev = { ...tesela, senales: [{ ...senal, rssiDbm: -50.7 }] };
      // rssi redondeado: -60 vs -51 -> cambiado
      const delta = deltaParaLora(previa, nuev);
      expect(typeof delta).toBe("string");
      const parsed = JSON.parse(delta);
      expect(parsed).toHaveProperty("cambios");
      const clave = "n1|n2|webrtc"; // de < a, medio webrtc
      expect(parsed.cambios).toHaveProperty(clave);
      expect(parsed.cambios[clave]).toHaveProperty("rssi");
      expect(parsed.cambios[clave].rssi).toBe(Math.round(-50.7)); // -51
      // snr no cambió, así que no debería estar en el entry
      expect(parsed.cambios[clave]).not.toHaveProperty("snr");
    });

    it("should detect changes in snr and return the correct delta format", () => {
      const previa = { ...tesela, senales: [{ ...senal, snrDb: 5.2 }] };
      const nuev = { ...tesela, senales: [{ ...senal, snrDb: 15.7 }] };
      // snr redondeado: 5 vs 16 -> cambiado
      const delta = deltaParaLora(previa, nuev);
      expect(typeof delta).toBe("string");
      const parsed = JSON.parse(delta);
      expect(parsed).toHaveProperty("cambios");
      const clave = "n1|n2|webrtc";
      expect(parsed.cambios).toHaveProperty(clave);
      expect(parsed.cambios[clave]).toHaveProperty("snr");
      expect(parsed.cambios[clave].snr).toBe(Math.round(15.7)); // 16
      // rssi no cambió, así que no debería estar en el entry
      expect(parsed.cambios[clave]).not.toHaveProperty("rssi");
    });

    it("should return empty string when the delta is too big and fallback to 6 strongest signals", () => {
      // Creamos una tesela con muchas señales para que el delta de cambios sea grande
      const previaSenales: SenalMedida[] = [];
      const nuevSenales: SenalMedida[] = [];
      for (let i = 0; i < 20; i++) {
        const senal: SenalMedida = {
          de: `n1`,
          a: `n2_${i}`,
          medio: "webrtc",
          rssiDbm: -50 + i, // variar para que todos cambien
          snrDb: 10,
          rttMs: 20,
          anchoBandaKbps: 1000,
          perdidaPct: 0,
          vistaEn: Date.now(),
        };
        previaSenales.push({ ...senal, rssiDbm: -50 + i - 10 }); // cambiar todos en 10
        nuevSenales.push(senal);
      }
      const previa: Tesela = { ...tesela, senales: previaSenales };
      const nuev: Tesela = { ...tesela, senales: nuevSenales };
      const delta = deltaParaLora(previa, nuev);
      // Esperamos que el delta sea el fallback de las 6 señales más fuertes (por rssiDbm)
      expect(typeof delta).toBe("string");
      const parsed = JSON.parse(delta);
      expect(parsed).toHaveProperty("señalesFuertes");
      const fuertes = parsed.señalesFuertes;
      // Debe tener exactamente 6 entradas
      expect(Object.keys(fuertes)).toHaveLength(6);
      // Cada entrada debería ser un objeto con rssi (redondeado) y posiblemente snr
      for (const clave in fuertes) {
        const entry = fuertes[clave];
        expect(entry).toHaveProperty("rssi");
        // El rssi debería ser uno de los 6 más altos de las nuevSenales
        // Las nuevSenales tienen rssiDbm desde -50 a -31 (porque i de 0 a 19: -50+0 a -50+19)
        // Los 6 más altos son: -31, -32, -33, -34, -35, -36
        // Pero note: hemos cambiado el rssi en la previa? En la previa le restamos 10, pero en el fallback usamos la nuev tesela.
        // Así que los rssi de las nuevSenales son: -50, -49, ..., -31
        // Los 6 más altos son: -31, -32, -33, -34, -35, -36
        // Redondeados son los mismos porque son enteros.
        // Vamos a comprobar que el valor de rssi esté en ese set.
        const rssiValor = entry.rssi;
        expect([-31, -32, -33, -34, -35, -36]).toContain(rssiValor);
      }
    });
  });

  describe("crearDifusor", () => {
    it("should return a function", () => {
      const deps = {
        broadcastMalla: (texto: string) => 0,
        enviarAPares: (texto: string) => {},
        enviarLora: (texto: string) => {},
      };
      const difusor = crearDifusor(deps);
      expect(typeof difusor).toBe("function");
    });

    it("should send via malla and pares every time", () => {
      const broadcastMalla = vi.fn(() => 0);
      const enviarAPares = vi.fn();
      const enviarLora = vi.fn();
      const deps = { broadcastMalla, enviarAPares, enviarLora };
      const difusor = crearDifusor(deps);

      const teselaConFirma = { ...tesela, firma: "firma1" };
      difusor(teselaConFirma);

       expect(broadcastMalla).toHaveBeenCalledTimes(1);
       expect(enviarAPares).toHaveBeenCalledTimes(1);
       const overArg1 = (broadcastMalla.mock.calls[0] as any)[0];
       const overArg2 = (enviarAPares.mock.calls[0] as any)[0];
       expect(overArg1).toBe(overArg2);
       const parsed = JSON.parse(overArg1);
       expect(parsed.tipo).toBe(SOBRE);
       expect(parsed.v).toBe(1);
       expect(parsed.t).toEqual(teselaConFirma);
    });

    it("should send via LoRa only when enough time has passed and there are changes", () => {
      const broadcastMalla = vi.fn(() => 0);
      const enviarAPares = vi.fn();
      const enviarLora = vi.fn();
      const deps = { broadcastMalla, enviarAPares, enviarLora };
      const difusor = crearDifusor(deps);

      const ahora = Date.now();
      // Mock Date.now para controlar el tiempo
      const fechaReal = Date.now;
      Date.now = () => ahora;

      // Primera tesela (sin previa para LoRa, así que no debe enviar por LoRa)
      const tesela1 = { ...tesela, firma: "firma1", senales: [{ ...senal, rssiDbm: -50 }] };
      difusor(tesela1);
      // Debe haber enviado por malla y pares, pero no por LoRa (porque no hay previa)
      expect(enviarLora).not.toHaveBeenCalled();

      // Segunda tesela con cambios, pero aún no han pasado 10 minutos
      const tesela2 = { ...tesela, firma: "firma2", senales: [{ ...senal, rssiDbm: -51 }] }; // cambió rssi
      difusor(tesela2);
      // Todavía no debe enviar por LoRa porque no han pasado 10 minutos
      expect(enviarLora).not.toHaveBeenCalled();

      // Avanzar el tiempo 10 minutos y 1 milisegundo
      Date.now = () => ahora + 10 * 60 * 1000 + 1;
      const tesela3 = { ...tesela, firma: "firma3", senales: [{ ...senal, rssiDbm: -52 }] }; // cambió nuevamente
      difusor(tesela3);
      // Ahora debe enviar por LoRa porque han pasado más de 10 minutos y hay cambios
       expect(enviarLora).toHaveBeenCalledTimes(1);
       const deltaArg = (enviarLora.mock.calls[0] as any)[0];
       expect(typeof deltaArg).toBe("string");
       const parsedDelta = JSON.parse(deltaArg);
       expect(parsedDelta).toHaveProperty("cambios");
       const clave = "n1|n2|webrtc";
       expect(parsedDelta.cambios).toHaveProperty(clave);
       expect(parsedDelta.cambios[clave]).toHaveProperty("rssi");
       // El cambio fue de -51 a -52 -> redondeado -51 a -52 -> cambió
       expect(parsedDelta.cambios[clave].rssi).toBe(Math.round(-52)); // -52

      // Reset mock
      Date.now = fechaReal;
    });

    it("should not send via LoRa if there are no changes, even if time passed", () => {
      const broadcastMalla = vi.fn(() => 0);
      const enviarAPares = vi.fn();
      const enviarLora = vi.fn();
      const deps = { broadcastMalla, enviarAPares, enviarLora };
      const difusor = crearDifusor(deps);

      const ahora = Date.now();
      const fechaReal = Date.now;
      Date.now = () => ahora;

      // Primera tesela
      const tesela1 = { ...tesela, firma: "firma1", senales: [{ ...senal, rssiDbm: -50 }] };
      difusor(tesela1);
      expect(enviarLora).not.toHaveBeenCalled();

      // Segunda tesela sin cambios
      const tesela2 = { ...tesela, firma: "firma2", senales: [{ ...senal, rssiDbm: -50 }] };
      // Avanzar el tiempo 10 minutos y 1 milisegundo
      Date.now = () => ahora + 10 * 60 * 1000 + 1;
      difusor(tesela2);
      // No debe enviar por LoRa porque no hay cambios
      expect(enviarLora).not.toHaveBeenCalled();

      Date.now = fechaReal;
    });
  });

});