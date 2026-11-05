import { describe, it, expect } from "vitest";
import { conInterfazViva } from "../prompt-astraura";

describe("conInterfazViva", () => {
  it("debería devolver el prompt base sin cambios si la interfaz es 'texto'", () => {
    const prompt = "Hola";
    expect(conInterfazViva(prompt, { interfaz: "texto" })).toBe(prompt);
  });

  it("debería añadir instrucciones de OpenUI si la interfaz es 'viva'", () => {
    const prompt = "Hola";
    const resultado = conInterfazViva(prompt, { interfaz: "viva" });
    expect(resultado).toContain("--- INSTRUCCIONES DE INTERFAZ VIVA (OPENUI) ---");
    expect(resultado).toContain("Instrucción: Usa OpenUI Lang SOLAMENTE");
  });

  it("debería añadir instrucciones de OpenUI si la interfaz es 'auto' y hay datos", () => {
    const prompt = "Lista los usuarios";
    const resultado = conInterfazViva(prompt, { interfaz: "auto" }, { tieneDatos: true });
    expect(resultado).toContain("--- INSTRUCCIONES DE INTERFAZ VIVA (OPENUI) ---");
  });

  it("debería añadir instrucciones de OpenUI si la interfaz es 'auto' y hay pasos", () => {
    const prompt = "Cómo configurar";
    const resultado = conInterfazViva(prompt, { interfaz: "auto" }, { tienePasos: true });
    expect(resultado).toContain("--- INSTRUCCIONES DE INTERFAZ VIVA (OPENUI) ---");
  });

  it("debería añadir instrucciones de OpenUI si la interfaz es 'auto' y hay comparación", () => {
    const prompt = "Compara opciones";
    const resultado = conInterfazViva(prompt, { interfaz: "auto" }, { tieneComparacion: true });
    expect(resultado).toContain("--- INSTRUCCIONES DE INTERFAZ VIVA (OPENUI) ---");
  });

  it("debería devolver el prompt base sin cambios si la interfaz es 'auto' sin señales", () => {
    const prompt = "Hola, cómo estás";
    expect(conInterfazViva(prompt, { interfaz: "auto" }, {})).toBe(prompt);
  });

  it("debería devolver el prompt base sin cambios si la interfaz es undefined sin señales", () => {
    const prompt = "Hola";
    expect(conInterfazViva(prompt, undefined, {})).toBe(prompt);
  });
});
