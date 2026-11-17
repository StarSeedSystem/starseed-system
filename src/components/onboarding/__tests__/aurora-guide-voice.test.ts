import { describe, it, expect } from "vitest";
import { parseVoiceCommand } from "../aurora-guide-voice";

describe("aurora-guide-voice · parseVoiceCommand", () => {
  it("detecta comando 'next' con varias palabras clave", () => {
    expect(parseVoiceCommand("siguiente")).toBe("next");
    expect(parseVoiceCommand("continúa")).toBe("next");
    expect(parseVoiceCommand("avanza")).toBe("next");
    expect(parseVoiceCommand("next")).toBe("next");
    expect(parseVoiceCommand("sigue")).toBe("next");
    expect(parseVoiceCommand("adelante")).toBe("next");
  });

  it("detecta comando 'prev' con varias palabras clave", () => {
    expect(parseVoiceCommand("anterior")).toBe("prev");
    expect(parseVoiceCommand("atrás")).toBe("prev");
    expect(parseVoiceCommand("vuelve")).toBe("prev");
    expect(parseVoiceCommand("previo")).toBe("prev");
    expect(parseVoiceCommand("back")).toBe("prev");
    expect(parseVoiceCommand("retrocede")).toBe("prev");
  });

  it("detecta comando 'close' con varias palabras clave", () => {
    expect(parseVoiceCommand("cerrar")).toBe("close");
    expect(parseVoiceCommand("cierra")).toBe("close");
    expect(parseVoiceCommand("salir")).toBe("close");
    expect(parseVoiceCommand("termina")).toBe("close");
    expect(parseVoiceCommand("terminar")).toBe("close");
    expect(parseVoiceCommand("listo")).toBe("close");
    expect(parseVoiceCommand("entendido")).toBe("close");
  });

  it("prioriza 'close' sobre 'prev' y 'next'", () => {
    expect(parseVoiceCommand("cierra y siguiente")).toBe("close");
    expect(parseVoiceCommand("termina anterior")).toBe("close");
  });

  it("prioriza 'prev' sobre 'next'", () => {
    expect(parseVoiceCommand("atras siguiente")).toBe("prev");
  });

  it("ignora palabras que no son comandos", () => {
    expect(parseVoiceCommand("hola mundo")).toBeNull();
    expect(parseVoiceCommand("")).toBeNull();
    expect(parseVoiceCommand("   ")).toBeNull();
  });

  it("mira solo las últimas palabras del transcript (últimas 4)", () => {
    expect(parseVoiceCommand("hola mundo siguiente")).toBe("next");
    expect(parseVoiceCommand("anterior hola mundo siguiente")).toBe("prev");
    expect(parseVoiceCommand("dice siguiente y luego anterior")).toBe("prev");
  });
});