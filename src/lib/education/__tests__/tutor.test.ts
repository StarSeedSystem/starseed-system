import { describe, it, expect } from "vitest";
import {
  esPeticionDeAprender,
  planTutoria,
  promptTutor,
  type RecuerdoTutoria,
} from "../tutor";

const recuerdos: RecuerdoTutoria[] = [
  { texto: "El Big Bang explica la expansión del universo.", titulo: "cosmología", tipo: "leccion" },
  { texto: "Recuerdo suelto del cerebro" },
];

describe("esPeticionDeAprender", () => {
  it("detecta peticiones de aprendizaje en español, con y sin acentos", () => {
    expect(esPeticionDeAprender("Explícame la fotosíntesis")).toBe(true);
    expect(esPeticionDeAprender("explicame el teorema de Bayes")).toBe(true);
    expect(esPeticionDeAprender("Quiero aprender a tocar la guitarra")).toBe(true);
    expect(esPeticionDeAprender("No entiendo el interés compuesto")).toBe(true);
    expect(esPeticionDeAprender("¿Cómo funciona esta malla LoRa?")).toBe(true);
    expect(esPeticionDeAprender("Enséñame a programar en Swift")).toBe(true);
    expect(esPeticionDeAprender("Hazme un examen de historia")).toBe(true);
    expect(esPeticionDeAprender("Ponme a prueba con lo de la célula")).toBe(true);
    expect(esPeticionDeAprender("Quiero entender la inflación")).toBe(true);
    expect(esPeticionDeAprender("Ayúdame a entender este concepto")).toBe(true);
  });

  it("detecta peticiones de aprendizaje en inglés", () => {
    expect(esPeticionDeAprender("Teach me quantum mechanics")).toBe(true);
    expect(esPeticionDeAprender("Help me understand pointers in C")).toBe(true);
    expect(esPeticionDeAprender("I don't get how recursion works")).toBe(true);
    expect(esPeticionDeAprender("Quiz me on the periodic table")).toBe(true);
    expect(esPeticionDeAprender("Make me some flashcards for the exam")).toBe(true);
  });

  it("no se dispara con frases cotidianas (falsos positivos)", () => {
    expect(esPeticionDeAprender("Hola, ¿qué tal el día?")).toBe(false);
    expect(esPeticionDeAprender("Pásame la botella de agua")).toBe(false);
    expect(esPeticionDeAprender("Explícame el problema del agua de la ciudad")).toBe(true);
    expect(esPeticionDeAprender("No me entendiste en el chat")).toBe(false);
    expect(esPeticionDeAprender("")).toBe(false);
    expect(esPeticionDeAprender("te")).toBe(false);
  });
});

describe("planTutoria", () => {
  it("devuelve los cuatro pasos en orden: explicar → comprobar → practicar → resumir", () => {
    const plan = planTutoria({ concepto: "fotosíntesis", nivel: "inicial" });
    expect(plan.concepto).toBe("fotosíntesis");
    expect(plan.nivel).toBe("inicial");
    expect(plan.pasos.map((p) => p.orden)).toEqual(["explicar", "comprobar", "practicar", "resumir"]);
    expect(plan.pasos.every((p) => p.instruccion.length > 0)).toBe(true);
  });

  it("toma los recuerdos del cerebro como base de conocimiento", () => {
    const plan = planTutoria({ concepto: "cosmología", recuerdos });
    expect(plan.pasos.some((p) => p.orden === "explicar" && p.usaRecuerdos)).toBe(true);
    expect(plan.baseRecuerdos.length).toBe(2);
    const comprobar = plan.pasos.find((p) => p.orden === "comprobar");
    expect(comprobar?.instruccion).toMatch(/pregunta/i);
  });

  it("funciona sin recuerdos y da un plan igual de válido", () => {
    const plan = planTutoria({ concepto: "estadística" });
    expect(plan.pasos.some((p) => p.orden === "comprobar")).toBe(true);
    expect(plan.baseRecuerdos.length).toBe(0);
  });
});

describe("promptTutor", () => {
  const plan = planTutoria({ concepto: "cosmología", recuerdos });

  it("sin interfaz viva: prompt limpio, sin OpenUI Lang", () => {
    const p = promptTutor(plan, false);
    expect(p).toContain("cosmología");
    expect(p).toContain("duda");
    expect(p).not.toContain("OpenUI Lang");
  });

  it("con interfaz viva: pide cuestionarios y tarjetas en OpenUI Lang", () => {
    const p = promptTutor(plan, true);
    expect(p).toContain("OpenUI Lang");
    expect(p.toLowerCase()).toContain("cuestionario");
    expect(p.toLowerCase()).toContain("tarjeta");
  });
});
