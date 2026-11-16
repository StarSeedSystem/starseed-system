import { describe, it, expect } from "vitest";
import { casoDeDecision, registrar } from "../registro-decision";
import type { CasoLaya } from "../aprendizaje-laya";

describe("casoDeDecision", () => {
  it("convierte respuesta de /api/astraura/decidir en CasoLaya para punto público", () => {
    const entrada = {
      punto: "publicar.moderar",
      ambito: "test",
      answer_confidence: 0.85,
      donde: "a1" as const,
      ms: 1200,
      escalo: false,
      estado: '{"publicacion":"test"}',
    };
    const resultado = casoDeDecision(entrada);
    expect(resultado).not.toBeNull();
    expect(resultado?.punto).toBe("publicar.moderar");
    expect(resultado?.ambito).toBe("test");
    expect(resultado?.p).toBe(0.85);
    expect(resultado?.donde).toBe("a1");
    expect(resultado?.ms).toBe(1200);
    expect(resultado?.resultado).toBe("aceptada");
    expect(resultado?.privado).toBe(false);
    expect(resultado?.estado).toBe(entrada.estado);
  });

  it("convierte respuesta escalada en CasoLaya con resultado escalada", () => {
    const entrada = {
      punto: "reflejo.herramienta",
      ambito: "test",
      answer_confidence: 0.45,
      donde: "a1" as const,
      ms: 1200,
      escalo: true,
      estado: '{"consulta":"test","herramientas":[{"name":"test"}]}',
    };
    const resultado = casoDeDecision(entrada);
    expect(resultado).not.toBeNull();
    expect(resultado?.resultado).toBe("escalada");
  });

  it("punto privado guarda huella en estado", () => {
    const entrada = {
      punto: "privacidad.subir",
      ambito: "test",
      answer_confidence: 0.75,
      donde: "a1" as const,
      ms: 800,
      escalo: false,
      estado: '{"dato":"privado","contacto":"alex@email.com"}',
    };
    const resultado = casoDeDecision(entrada);
    expect(resultado).not.toBeNull();
    expect(resultado?.privado).toBe(true);
    expect(resultado?.estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(resultado?.estado).not.toContain("privado");
    expect(resultado?.estado).not.toContain("contacto");
  });

  it("punto desconocido devuelve null", () => {
    const entrada = {
      punto: "punto.inexistente",
      ambito: "test",
      answer_confidence: 0.8,
      donde: "a1" as const,
      ms: 1000,
      escalo: false,
      estado: "{}",
    };
    const resultado = casoDeDecision(entrada);
    expect(resultado).toBeNull();
  });

  it("answer_confidence inválido devuelve null", () => {
    const entrada = {
      punto: "reflejo.herramienta",
      ambito: "test",
      answer_confidence: NaN,
      donde: "a1" as const,
      ms: 1000,
      escalo: false,
      estado: "{}",
    };
    const resultado = casoDeDecision(entrada);
    expect(resultado).toBeNull();
  });
});

describe("registrar", () => {
  it("anota un caso en el registro usando anotar", () => {
    const registro: readonly CasoLaya[] = [];
    const entrada = {
      punto: "publicar.moderar",
      ambito: "test",
      answer_confidence: 0.8,
      donde: "a1" as const,
      ms: 1000,
      escalo: false,
      estado: "{}",
    };
    const nuevoRegistro = registrar(registro, entrada);
    expect(nuevoRegistro.length).toBe(1);
    expect(nuevoRegistro[0].punto).toBe("publicar.moderar");
    expect(nuevoRegistro[0].resultado).toBe("aceptada");
  });

  it("no muta el registro original", () => {
    const registro: readonly CasoLaya[] = [];
    const entrada = {
      punto: "publicar.moderar",
      ambito: "test",
      answer_confidence: 0.8,
      donde: "a1" as const,
      ms: 1000,
      escalo: false,
      estado: "{}",
    };
    const nuevoRegistro = registrar(registro, entrada);
    expect(registro.length).toBe(0);
    expect(nuevoRegistro.length).toBe(1);
  });

  it("punto desconocido no añade nada al registro", () => {
    const registro: readonly CasoLaya[] = [];
    const entrada = {
      punto: "punto.inexistente",
      ambito: "test",
      answer_confidence: 0.8,
      donde: "a1" as const,
      ms: 1000,
      escalo: false,
      estado: "{}",
    };
    const nuevoRegistro = registrar(registro, entrada);
    expect(nuevoRegistro.length).toBe(0);
  });
});