import { describe, it, expect } from "vitest";
import {
  AVISO_TRANSCRIPT,
  combinarTranscript,
  describirFalloTranscript,
} from "@/lib/onboarding/transcript-voz";

describe("combinarTranscript", () => {
  it("devuelve cadena vacía cuando no hay estado (ni el ' ' de antes)", () => {
    expect(combinarTranscript(null)).toBe("");
    expect(combinarTranscript(undefined)).toBe("");
    expect(combinarTranscript({})).toBe("");
  });

  it("junta transcript e interim con un solo espacio", () => {
    expect(combinarTranscript({ transcript: "hola", interim: "mundo" })).toBe(
      "hola mundo",
    );
  });

  it("no deja espacio final cuando solo hay transcript", () => {
    expect(combinarTranscript({ transcript: "siguiente" })).toBe("siguiente");
  });

  it("no deja espacio inicial cuando solo hay interim", () => {
    expect(combinarTranscript({ interim: "continúa" })).toBe("continúa");
  });

  it("recorta los espacios sobrantes de cada parte", () => {
    expect(combinarTranscript({ transcript: "  hola ", interim: " mundo  " })).toBe(
      "hola mundo",
    );
  });

  it("ignora valores que no son texto en el puente externo", () => {
    expect(
      combinarTranscript({
        transcript: 42 as unknown,
        interim: null,
      }),
    ).toBe("");
  });
});

describe("describirFalloTranscript", () => {
  it("deja traza con el mensaje del error", () => {
    const r = describirFalloTranscript(new Error("boom"));
    expect(r.diagnostico).toContain("[guia]");
    expect(r.diagnostico).toContain("boom");
  });

  it("acepta un error en texto plano sin romper el diagnóstico", () => {
    expect(describirFalloTranscript("sin puente").diagnostico).toContain("sin puente");
  });

  it("no deja separador colgando cuando no hay mensaje", () => {
    expect(describirFalloTranscript(null).diagnostico).toBe(
      "[guia] no se pudo leer el transcript de Aurora",
    );
  });

  it("recorta mensajes larguísimos para no ensuciar la consola", () => {
    const r = describirFalloTranscript(new Error("x".repeat(500)));
    expect(r.diagnostico).toContain("x".repeat(200));
    expect(r.diagnostico).not.toContain("x".repeat(201));
  });

  it("el aviso invita a seguir con los botones, sin dejar el rito en bucle", () => {
    const r = describirFalloTranscript(new Error("boom"));
    expect(r.aviso).toBe(AVISO_TRANSCRIPT);
    expect(r.aviso).toContain("botones");
  });
});
