// ProtoGenesis · pruebas del director (PG1013F)

import { describe, it, expect } from "vitest";
import { promptDirector, planificarEncargo } from "../director";
import type { Encargo, Plan } from "./encargo";

// Mock del contexto de validarPlan
const ctxMock = { existeAtomo: (id: string): "si" | "solo-enlace" | "no" => id === "herramienta-inexistente" ? "no" : id === "solo-enlace" ? "solo-enlace" : "si", hayConversion: (de: string, a: string): boolean => de === a || (de === "png" && a === "jpg") || (de === "txt" && a === "md"), formatoDe: (entrada: string): string | null => entrada === "prompt-texto" ? "txt" : entrada === "imagen-entrada" ? "png" : null };

// Ejemplo de encargo válido
const encargoEjemplo: Encargo = { id: "e1", moleculaId: "m1", ambito: "personal", intencion: "Crear imagen desde texto", criterios: [{ tipo: "formato", valor: "jpg", texto: "Salida JPG" }, { tipo: "tamano-max", valor: 1024, texto: "Máx 1024" }], autor: { tipo: "persona", id: "u1" }, origen: "texto", creadoEn: Date.now() };

// Ejemplo de átomos disponibles
const atomosEjemplo = [
  { id: "t1", nombre: "txt", entrada: [], salida: ["txt"] },
  { id: "t2", nombre: "png", entrada: ["txt"], salida: ["png"] },
  { id: "t3", nombre: "jpg", entrada: ["png"], salida: ["jpg"] },
  { id: "solo", nombre: "solo-enlace", entrada: [], salida: ["mp4"] },
];

describe("promptDirector", () => {
  it("devuelve un prompt no vacío", () => {
    const prompt = promptDirector(encargoEjemplo, atomosEjemplo);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain(encargoEjemplo.intencion);
    expect(prompt).toContain(encargoEjemplo.autor.id);
  });
});

describe("planificarEncargo", () => {
  it("devuelve plan válido a la primera con LLM cooperativo", async () => {
    // LLM que devuelve un plan válido
    const llamar = async (prompt: string) => {
      // Devolver un plan que pasará la validación
      return JSON.stringify({
        pasos: [
          {
            id: "paso1",
            atomo: "text-prompt",
            titulo: "Obtener prompt de texto",
            entradas: [],
            salida: { formato: "txt" },
            depende: [],
            criterios: [
              { tipo: "formato", valor: "txt", texto: "Salida de texto" }
            ],
            computo: "navegador"
          },
          {
            id: "paso2",
            atomo: "texturas-webgl",
            titulo: "Generar imagen desde prompt",
            entradas: ["txt"],
            salida: { formato: "png" },
            depende: ["paso1"],
            criterios: [
              { tipo: "formato", valor: "png", texto: "Imagen PNG" },
              { tipo: "tamano-max", valor: 1024, texto: "Tamaño máximo 1024" }
            ],
            computo: "navegador"
          },
          {
            id: "paso3",
            atomo: "convertidor-png-jpg",
            titulo: "Convertir PNG a JPG",
            entradas: ["png"],
            salida: { formato: "jpg" },
            depende: ["paso2"],
            criterios: [
              { tipo: "formato", valor: "jpg", texto: "Imagen JPG" }
            ],
            computo: "navegador"
          }
        ]
      });
    };

    const resultado = await planificarEncargo(
      encargoEjemplo,
      atomosEjemplo,
      llamar,
      ctxMock
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.plan).toBeDefined();
      expect(resultado.plan.pasos.length).toBe(3);
      expect(resultado.avisos).toEqual([]);
    }
  });

  it("devuelve plan válido en el segundo intento después de un error", async () => {
    let intento = 0;
    const llamar = async (_: string) => {
      intento++;
      if (intento === 1) return "Este no es JSON";
      return JSON.stringify({ pasos: [{ id: "p1", atomo: "t1", titulo: "t1", entradas: [], salida: { formato: "txt" }, depende: [], criterios: [{ tipo: "formato", valor: "txt", texto: "txt" }], computo: "navegador" }]);
    };

    const resultado = await planificarEncargo(
      encargoEjemplo,
      atomosEjemplo,
      llamar,
      ctxMock
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.plan.pasos.length).toBe(1);
  });

  it("devuelve ok false después de dos intentos fallidos", async () => {
    const llamar = async (_: string) => "texto plano sin json";
    const resultado = await planificarEncargo(encargoEjemplo, atomosEjemplo, llamar, ctxMock);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("No se encontró JSON");
  });

  it("devuelve ok false cuando el LLM devuelve JSON pero no pasa la validación", async () => {
    const llamar = async (_: string) => JSON.stringify({ foo: "bar" });
    const resultado = await planificarEncargo(encargoEjemplo, atomosEjemplo, llamar, ctxMock);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("plan");
  });
});