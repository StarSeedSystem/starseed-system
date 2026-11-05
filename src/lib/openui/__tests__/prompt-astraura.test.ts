import { describe, expect, it } from "vitest";
import { conInterfazViva } from "../prompt-astraura";
import type { AjustesPerfilRespuesta } from "@/lib/astraura/ajustes-respuesta";

const PROMPT_BASE = "Eres Aurora, la IA de StarSeed OS.";

describe("conInterfazViva", () => {
  it("devuelve el prompt base sin cambios cuando interfaz es 'texto'", () => {
    const ajustes: AjustesPerfilRespuesta = { revisionPeces: "creaciones", interfaz: "texto" };
    expect(conInterfazViva(PROMPT_BASE, ajustes)).toBe(PROMPT_BASE);
  });

  it("añade el prompt de OpenUI cuando interfaz es 'viva'", () => {
    const ajustes: AjustesPerfilRespuesta = { revisionPeces: "creaciones", interfaz: "viva" };
    const resultado = conInterfazViva(PROMPT_BASE, ajustes);
    expect(resultado).toContain(PROMPT_BASE);
    expect(resultado).toContain("OpenUI");
    expect(resultado).toContain("biblioteca StarSeed");
  });

  it("añade el prompt de OpenUI cuando interfaz es 'auto' (por defecto)", () => {
    const ajustes: AjustesPerfilRespuesta = { revisionPeces: "creaciones", interfaz: "auto" };
    const resultado = conInterfazViva(PROMPT_BASE, ajustes);
    expect(resultado).toContain(PROMPT_BASE);
    expect(resultado).toContain("OpenUI");
    expect(resultado).toContain("biblioteca StarSeed");
  });

  it("incluye la instrucción de usar OpenUI Lang solo con datos, pasos o comparaciones", () => {
    const ajustes: AjustesPerfilRespuesta = { revisionPeces: "creaciones", interfaz: "auto" };
    const resultado = conInterfazViva(PROMPT_BASE, ajustes);
    expect(resultado).toContain("datos, pasos o comparaciones");
  });

  it("maneja ajustes undefined usando el valor por defecto 'auto'", () => {
    const resultado = conInterfazViva(PROMPT_BASE, undefined);
    expect(resultado).toContain(PROMPT_BASE);
    expect(resultado).toContain("OpenUI");
  });

  it("maneja ajustes null usando el valor por defecto 'auto'", () => {
    const resultado = conInterfazViva(PROMPT_BASE, null);
    expect(resultado).toContain(PROMPT_BASE);
    expect(resultado).toContain("OpenUI");
  });

  it("maneja ajustes parciales (solo interfaz)", () => {
    const resultado = conInterfazViva(PROMPT_BASE, { interfaz: "viva" } as Partial<AjustesPerfilRespuesta>);
    expect(resultado).toContain(PROMPT_BASE);
    expect(resultado).toContain("OpenUI");
  });
});