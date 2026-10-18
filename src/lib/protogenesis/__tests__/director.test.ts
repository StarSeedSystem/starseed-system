/**
 * TESTS DE director · ProtoGenesis PG1013F
 * Cubren las funciones promptDirector y planificarEncargo
 * Según lo especificado en la tarea PG1013F
 */

import { describe, it, expect } from "vitest";

import {
  promptDirector,
  planificarEncargo,
} from "../director";

import type { Encargo } from "../encargo";
import type { Computo } from "@/lib/protomolecula/tipos";

describe("promptDirector", () => {
  it("debe generar un prompt válido con encargo y átomos", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula de prueba",
      criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      {
        id: "atomo1",
        nombre: "Átomo de prueba",
        entrada: ["entrada1"],
        salida: ["salida1"],
      },
    ];

    const prompt = promptDirector(encargo, atomos);
    
    // Verificar que contenga elementos clave
    expect(prompt).toContain("Eres el director de ProtoGenesis");
    expect(prompt).toContain(encargo.intencion);
    expect(prompt).toContain(encargo.ambito);
    expect(prompt).toContain(atomos[0].nombre);
    expect(prompt).toContain("Máximo 24 pasos");
    expect(prompt).toContain("Solo devuelve el JSON, nada más");
    expect(prompt).toContain('"pasos"');
  });

  it("debe limitar la lista de átomos a 40 como máximo", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "test" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    // Crear 45 átomos
    const atomos = Array(45)
      .fill(0)
      .map((_, i) => ({
        id: `atomo${i}`,
        nombre: `Átomo ${i}`,
        entrada: [`entrada${i}`],
        salida: [`salida${i}`],
      }));

    const prompt = promptDirector(encargo, atomos);
    
    // Verificar que solo se incluyan los primeros 40
    for (let i = 0; i < 40; i++) {
      expect(prompt).toContain(`Átomo ${i}`);
    }
    
    // Verificar que no se incluyan los últimos 5
    for (let i = 40; i < 45; i++) {
      expect(prompt).not.toContain(`Átomo ${i}`);
    }
  });
});

describe("planificarEncargo", () => {
  // Mock de contexto para validarPlan
  const ctxMock = {
    existeAtomo: (id: string): "si" | "solo-enlace" | "no" => {
      // Simulamos que todos los átomos existen excepto los que empiezan con "no-"
      if (id.startsWith("no-")) return "no";
      if (id === "solo-enlace-id") return "solo-enlace";
      return "si";
    },
    hayConversion: (de: string, a: string): boolean => {
      // Simulamos que hay conversión excepto de "formatonovalido" a cualquier cosa
      return !(de === "formatonovalido");
    },
    formatoDe: (entrada: string): string | null => {
      // Devolvemos el mismo formato si es válido
      if (entrada === "formatonovalido") return null;
      return entrada;
    },
  };

  it("debe devolver plan válido a la primera con llamar exitoso", async () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula de prueba",
      criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      {
        id: "atomo1",
        nombre: "Átomo de prueba",
        entrada: [],
        salida: ["json"],
      },
    ];

    // Mock de llamar que devuelve un plan válido en el primer intento
    const llamarMock = async (prompt: string): Promise<string> => {
      return JSON.stringify({
        pasos: [
          {
            id: "paso1",
            atomo: "atomo1",
            titulo: "Crear salida JSON",
            entradas: [],
            salida: { formato: "json" },
            depende: [],
            criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
            computo: "navegador" as Computo,
          },
        ],
      });
    };

    const resultado = await planificarEncargo(
      encargo,
      atomos,
      llamarMock,
      ctxMock
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.plan.encargoId).toBe("E001");
      expect(resultado.plan.pasos).toHaveLength(1);
      expect(resultado.plan.pasos[0].id).toBe("paso1");
      expect(resultado.avisos).toHaveLength(0);
    }
  });

  it("debe manejar plan inválido seguido de plan válido (un reintento)", async () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula de prueba",
      criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      {
        id: "atomo1",
        nombre: "Átomo de prueba",
        entrada: [],
        salida: ["json"],
      },
    ];

    let llamadaCount = 0;
      // Mock de llamar que falla la primera vez (átomo 'no') y acierta la segunda
      const llamarMock = async (prompt: string): Promise<string> => {
        llamadaCount++;
        if (llamadaCount === 1) {
          // Primera llamada: devuelve plan con átomo 'no' (inválido)
          return JSON.stringify({
            pasos: [
              {
                id: "paso1",
                atomo: "no", // Átomo 'no' es inválido según validarPlan
                titulo: "Paso con átomo inválido",
                entradas: [],
                salida: { formato: "json" },
                depende: [],
                criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
                computo: "navegador" as Computo,
              },
            ],
          });
        } else {
          // Segunda llamada: devuelve plan válido
          return JSON.stringify({
            pasos: [
              {
                id: "paso1",
                atomo: "atomo1",
                titulo: "Crear salida JSON",
                entradas: [],
                salida: { formato: "json" },
                depende: [],
                criterios: [{ tipo: "formato", texto: "salida en formato JSON" }],
                computo: "navegador" as Computo,
              },
            ],
          });
        }
      };

    const resultado = await planificarEncargo(
      encargo,
      atomos,
      llamarMock,
      ctxMock
    );

      expect(llamadaCount).toBe(2); // Debe haber hecho 2 llamadas
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.plan.encargoId).toBe("E001");
        expect(resultado.plan.pasos).toHaveLength(1);
        // Con un plan válido en el segundo intento, no debería haber avisos
        // (ya que no hay entradas que sean salidas de otros pasos en un plan de un solo paso)
        expect(resultado.avisos).toHaveLength(0);
      }
  });

  it("debe devolver ok false después de dos intentos fallidos", async () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula de prueba",
      criterios: [{ tipo: "formato", texto: "test" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      {
        id: "atomo1",
        nombre: "Átomo de prueba",
        entrada: [],
        salida: ["json"],
      },
    ];

    let llamadaCount = 0;
    // Mock de llamar que siempre falla
    const llamarMock = async (prompt: string): Promise<string> => {
      llamadaCount++;
      if (llamadaCount === 1) {
        // Primera llamada: JSON sin propiedad pasos
        return JSON.stringify({ mensaje: "hola" });
      } else {
        // Segunda llamada: tampoco tiene pasos
        return JSON.stringify({ otro: "valor" });
      }
    };

    const resultado = await planificarEncargo(
      encargo,
      atomos,
      llamarMock,
      ctxMock
    );

    expect(llamadaCount).toBe(2); // Debe haber hecho exactamente 2 llamadas
    expect(resultado.ok).toBe(false);
    // Cuando ambos intentos encuentran JSON pero es inválido (falta propiedad pasos)
    expect(resultado.motivo).toContain("No se pudo parsear el JSON después de 2 intentos: El JSON debe contener una propiedad 'pasos'");
  });

  it("deva devolver ok false cuando la respuesta no contiene JSON", async () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "test" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      {
        id: "atomo1",
        nombre: "Átomo de prueba",
        entrada: [],
        salida: ["json"],
      },
    ];

    // Mock de llamar que devuelve texto plano sin JSON
    const llamarMock = async (): Promise<string> => {
      return "Este es un texto plano sin ningún JSON";
    };

    const resultado = await planificarEncargo(
      encargo,
      atomos,
      llamarMock,
      ctxMock
    );

    expect(resultado.ok).toBe(false);
    // Cuando ningún intento encuentra JSON
    expect(resultado.motivo).toContain("No se encontró ningún bloque JSON en la respuesta después de 2 intentos");
  });
});