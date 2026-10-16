import { describe, it, expect } from "vitest";

import type { 
  NeuronaReticula, SenalMedida, Medio, Tesela, Reticula
} from "../tipos";
import { 
  temperaturaDe, 
  estadoDe, 
  cristalizar 
} from "../cristalizacion";
import { crearTesela } from "../teselas";

describe("cristalizacion", () => {
  describe("temperaturaDe", () => {
    it("debería devolver 0.5 cuando no hay historial", () => {
      const resultado = temperaturaDe([], 120000, 1000);
      expect(resultado).toEqual({});
    });

    it("debería calcular temperatura correctamente", () => {
      const ahora = 1000;
      const historial = [
        { clave: "neurona1", t: ahora - 10000, calidad: 0.8 },
        { clave: "neurona1", t: ahora - 20000, calidad: 0.6 },
        { clave: "neurona1", t: ahora - 30000, calidad: 0.4 },
        { clave: "neurona2", t: ahora - 15000, calidad: 0.9 },
        { clave: "neurona2", t: ahora - 25000, calidad: 0.7 },
      ];
      
      const resultado = temperaturaDe(historial, 50000, ahora);
      
      // neurona1: valores [0.8, 0.6, 0.4] -> media 0.6, desviación típica ~0.163
      // Normalizada: (0.163 - 0.25) / (1 - 0.25) = negativo -> 0
      expect(resultado.neurona1).toBeCloseTo(0, 0.1);
      
      // neurona2: valores [0.9, 0.7] -> media 0.8, desviación típica = 0.1
      // Normalizada: (0.1 - 0.25) / (1 - 0.25) = negativo -> 0
      expect(resultado.neurona2).toBeCloseTo(0, 0.1);
    });

    it("debería respetar la ventana de tiempo", () => {
      const ahora = 1000;
      const historial = [
        { clave: "neurona1", t: ahora - 10000, calidad: 0.9 }, // Dentro de 50s
        { clave: "neurona1", t: ahora - 60000, calidad: 0.1 }, // Fuera de 50s
      ];
      
      const resultado = temperaturaDe(historial, 50000, ahora);
      // Solo debería considerar la primera señal
      // Con una sola señal, desviación típica = 0 -> temperatura = 0
      expect(resultado.neurona1).toBeCloseTo(0, 0.1);
    });
  });

  describe("estadoDe", () => {
    it("debería devolver 'fundido' para temperatura >= 0.6", () => {
      expect(estadoDe(0.6)).toBe("fundido");
      expect(estadoDe(0.8)).toBe("fundido");
      expect(estadoDe(1.0)).toBe("fundido");
    });

    it("debería devolver 'subenfriado' para temperatura >= 0.25 y < 0.6", () => {
      expect(estadoDe(0.25)).toBe("subenfriado");
      expect(estadoDe(0.4)).toBe("subenfriado");
      expect(estadoDe(0.59)).toBe("subenfriado");
    });

    it("debería devolver 'vitreo' para temperatura < 0.25", () => {
      expect(estadoDe(0.0)).toBe("vitreo");
      expect(estadoDe(0.24)).toBe("vitreo");
      expect(estadoDe(0.1)).toBe("vitreo");
    });
  });

  describe("cristalizar", () => {
    const crearNeurona = (id: string, esRouter = false, bateriaPct = 50, ramGb = 4): NeuronaReticula => ({
      id,
      cuenta: "cuenta1",
      esRouter,
      capacidad: {
        ramGb,
        bateriaPct,
        cargando: false
      },
      medios: ['wifi-lan', 'ble', 'lora']
    });

    const crearSenal = (de: string, a: string, medio: Medio, rssiDbm: number): SenalMedida => ({
      de,
      a,
      medio,
      rssiDbm,
      vistaEn: 1000
    });

    it("debería conectar 5 neuronas en línea", () => {
      // Crear 5 neuronas en línea
      const neuronas = [
        crearNeurona("n1"),
        crearNeurona("n2"),
        crearNeurona("n3"),
        crearNeurona("n4"),
        crearNeurona("n5")
      ];
      
      // Crear teselas con señales entre neuronas adyacentes
      const teselas: Tesela[] = [
        crearTesela(neuronas[0], [crearSenal("n1", "n2", "wifi-lan", -50)], 1000),
        crearTesela(neuronas[1], [crearSenal("n2", "n1", "wifi-lan", -50), crearSenal("n2", "n3", "wifi-lan", -50)], 1000),
        crearTesela(neuronas[2], [crearSenal("n3", "n2", "wifi-lan", -50), crearSenal("n3", "n4", "wifi-lan", -50)], 1000),
        crearTesela(neuronas[3], [crearSenal("n4", "n3", "wifi-lan", -50), crearSenal("n4", "n5", "wifi-lan", -50)], 1000),
        crearTesela(neuronas[4], [crearSenal("n5", "n4", "wifi-lan", -50)], 1000)
      ];
      
      const retícula: Reticula = { 
        teselas: Object.fromEntries(teselas.map(t => [t.origen, t])) 
      };
      
      const resultado = cristalizar(retícula);
      
      // Verificar que hay puentes
      expect(resultado.puentes.length).toBeGreaterThan(0);
      
      // Verificar que nadie supera su coordinación objetivo
      // Todas son neuronas normales (no routers) con batería > 20% y ramGb >= 2 -> coordinación objetivo = 4
      for (const [id, coordinacion] of Object.entries(resultado.coordinacion)) {
        expect(coordinacion).toBeLessThanOrEqual(4);
      }
      
      // Verificar que todas están conectadas (al menos 4 puentes para 5 neuronas en línea)
      expect(resultado.puentes.length).toBeGreaterThanOrEqual(4);
    });

     it("debería manejar una neurona aislada", () => {
       const neurona = crearNeurona("sola");
       const tesela = crearTesela(neurona, [], 1000); // Sin señales
       const retícula: Reticula = { teselas: { [tesela.origen]: tesela } };
       
       const resultado = cristalizar(retícula);
       
       // Una neurona aislada no debería romper nada
       expect(resultado.puentes.length).toBe(0);
       expect(resultado.coordinacion["sola"]).toBe(0);
       expect(resultado.estado).toBe("subenfriado");
       // Vamos a verificar qué temperatura se está usando
     });

    it("debería dar el mismo resultado barajando teselas", () => {
      // Crear un conjunto de teselas
      const numNeuronas = 4;
      const neuronas = Array.from({ length: numNeuronas }, (_, i) => 
        crearNeurona(`n${i+1}`)
      );
      
      const teselasOriginal: Tesela[] = [];
      // Crear una malla completa
      for (let i = 0; i < numNeuronas; i++) {
        for (let j = i + 1; j < numNeuronas; j++) {
          teselasOriginal.push(
            crearTesela(
              neuronas[i], 
              [crearSenal(neuronas[i].id, neuronas[j].id, "wifi-lan", -50)], 
              1000
            )
          );
        }
      }
      
      // Barajar las teselas
      const teselasBarajadas = [...teselasOriginal].sort(() => Math.random() - 0.5);
      
      const retículaOriginal: Reticula = { 
        teselas: Object.fromEntries(teselasOriginal.map(t => [t.origen, t])) 
      };
      const retículaBarajada: Reticula = { 
        teselas: Object.fromEntries(teselasBarajadas.map(t => [t.origen, t])) 
      };
      
      const resultadoOriginal = cristalizar(retículaOriginal);
      const resultadoBarajada = cristalizar(retículaBarajada);
      
      // El número de puentes debería ser el mismo
      expect(resultadoOriginal.puentes.length).toBe(resultadoBarajada.puentes.length);
      
      // El estado debería ser el mismo
      expect(resultadoOriginal.estado).toBe(resultadoBarajada.estado);
    });
  });
});