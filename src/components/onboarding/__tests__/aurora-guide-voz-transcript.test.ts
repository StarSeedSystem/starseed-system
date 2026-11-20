import { describe, expect, it } from "vitest";
import { componerTranscript } from "../aurora-guide-voice";

describe("guía · transcript de voz", () => {
  it("junta lo ya dicho y lo que se está diciendo con un solo espacio", () => {
    expect(componerTranscript("abre el", "escritorio")).toBe("abre el escritorio");
  });

  it("ignora las partes vacías o ausentes", () => {
    expect(componerTranscript("siguiente", "")).toBe("siguiente");
    expect(componerTranscript(undefined, "continúa")).toBe("continúa");
    expect(componerTranscript(null, null)).toBe("");
    expect(componerTranscript()).toBe("");
  });

  it("recorta los espacios de sobra y no deja un transcript en blanco", () => {
    expect(componerTranscript("  hola  ", "  mundo ")).toBe("hola mundo");
    expect(componerTranscript("   ", "   ")).toBe("");
  });

  it("conserva tildes y signos para que el comando se reconozca", () => {
    expect(componerTranscript("¿continúa?", "sí")).toBe("¿continúa? sí");
  });
});
