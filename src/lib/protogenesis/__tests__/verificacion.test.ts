/**
 * TESTS DE verificarPaso y siguienteIntento · ProtoGenesis PG1013C
 * Cubre todos los criterios definidos en architecture/protogenesis.md §6·§6.2,
 * architecture/protomolecula.md §3·7·8 y los requisitos del contracto.
 */

import { describe, it, expect } from "vitest";

import { verificarPaso, siguienteIntento, Resultado, Quien, ResultadoVerificacion } from "../verificacion";

import { Paso, Criterio } from "../encargo";

/** Crea un Paso de prueba con un criterio. */
function crearPaso(id: string, criterios: Criterio[]): Paso {
  return {
    id,
    atomo: "herramienta",
    titulo: `Paso ${id}`,
    entradas: [],
    salida: { formato: "" },
    depende: [],
    criterios,
  };
}

describe("verificarPaso", () => {
  it("rechaza la verificación cuando el verificador es el autor", () => {
    const paso = crearPaso("P1", [{ tipo: "formato", valor: "json", texto: "formato" }]);
    const resultado: Resultado = { formato: "json" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U001");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el autor no puede verificarse a sí mismo");
    expect(verificacion.pendientes).toHaveLength(0);
  });

  it("acepta cuando el formato coincide (normalizado)", () => {
    const paso = crearPaso("P1", [{ tipo: "formato", valor: "  JSON  ", texto: "formato" }]);
    const resultado: Resultado = { formato: "json" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
    expect(verificacion.fallos).toHaveLength(0);
  });

  it("rechaza cuando el formato no coincide", () => {
    const paso = crearPaso("P1", [{ tipo: "formato", valor: "json", texto: "formato" }]);
    const resultado: Resultado = { formato: "xml" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("formato 'formato' no coincide (esperado: json, recibido: xml)");
  });

  it("rechaza cuando la duración excede el máximo", () => {
    const paso = crearPaso("P1", [
      { tipo: "duracion-max", valor: 5, texto: "duración máxima" },
    ]);
    const resultado: Resultado = { formato: "", duracionS: 10 };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("duración 10 excede el máximo de 5");
  });

  it("acepta cuando la duración está dentro del límite", () => {
    const paso = crearPaso("P1", [
      { tipo: "duracion-max", valor: 10, texto: "duración máxima" },
    ]);
    const resultado: Resultado = { formato: "", duracionS: 5 };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
  });

  it("rechaza cuando el tamaño excede el máximo", () => {
    const paso = crearPaso("P1", [
      { tipo: "tamano-max", valor: 1024, texto: "tamaño máximo" },
    ]);
    const resultado: Resultado = { formato: "", bytes: 2048 };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("tamaño 2048 excede el máximo de 1024");
  });

  it("rechaza cuando el resultado contiene texto secreto (sk-)", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["token"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "sk-123abc" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el resultado contiene texto secreto: sin secretos");
  });

  it("rechaza cuando el resultado contiene texto secreto (ghp_)", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["token"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "ghp_abc123" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el resultado contiene texto secreto: sin secretos");
  });

  it("rechaza cuando el resultado contiene texto secreto (Bearer)", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["token"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "Bearer abcdef123456" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el resultado contiene texto secreto: sin secretos");
  });

  it("rechaza cuando el resultado contiene texto secreto (AKIA)", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["token"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "AKIAEXAMPLE123" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el resultado contiene texto secreto: sin secretos");
  });

  it("acepta cuando no hay texto secreto", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["token"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "este es un texto limpio" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
  });

  it("acepta cuando el texto secreto está en la lista de valores", () => {
    const paso = crearPaso("P1", [
      { tipo: "sin-secretos", valor: ["sk-123", "ghp_456"], texto: "sin secretos" },
    ]);
    const resultado: Resultado = { formato: "", texto: "sk-123" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("el resultado contiene texto secreto: sin secretos");
  });

  it("rechaza cuando faltan capas (algunas)", () => {
    const paso = crearPaso("P1", [
      { tipo: "capas-presentes", valor: ["capa1", "capa2"], texto: "capas presentes" },
    ]);
    const resultado: Resultado = { formato: "", capas: ["capa1"] };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("falta capas: capa2");
  });

  it("rechaza cuando faltan todas las capas", () => {
    const paso = crearPaso("P1", [
      { tipo: "capas-presentes", valor: ["capa1", "capa2"], texto: "capas presentes" },
    ]);
    const resultado: Resultado = { formato: "", capas: [] };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("falta capas: capa1, capa2");
  });

  it("acepta cuando todas las capas están presentes", () => {
    const paso = crearPaso("P1", [
      { tipo: "capas-presentes", valor: ["capa1", "capa2"], texto: "capas presentes" },
    ]);
    const resultado: Resultado = { formato: "", capas: ["capa1", "capa2"] };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
    expect(verificacion.fallos).toHaveLength(0);
    expect(verificacion.pendientes).toHaveLength(0);
  });

  it("marca como pendiente cuando no hay lista de valores", () => {
    const paso = crearPaso("P1", [
      { tipo: "capas-presentes", texto: "capas presentes" },
    ]);
    const resultado: Resultado = { formato: "", capas: ["capa1"] };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
    expect(verificacion.pendientes).toContain("capas presentes");
  });

  it("rechaza cuando el verificador es una persona y manuales=false", () => {
    const paso = crearPaso("P1", [
      { tipo: "persona", texto: "verificación humana" },
    ]);
    const resultado: Resultado = { formato: "" };
    const quien: Quien = { id: "U001", tipo: "persona" };
    const manuales = { 0: false };

    const verificacion = verificarPaso(paso, resultado, quien, "U002", manuales);

    expect(verificacion.ok).toBe(true);
    expect(verificacion.pendientes).toContain("verificación humana");
  });

  it("acepta cuando el verificador es una persona y manuales=true", () => {
    const paso = crearPaso("P1", [
      { tipo: "persona", texto: "verificación humana" },
    ]);
    const resultado: Resultado = { formato: "" };
    const quien: Quien = { id: "U001", tipo: "persona" };
    const manuales = { 0: true };

    const verificacion = verificarPaso(paso, resultado, quien, "U002", manuales);

    expect(verificacion.ok).toBe(true);
    expect(verificacion.pendientes).toHaveLength(0);
  });

  it("rechaza cuando varios criterios fallan", () => {
    const paso = crearPaso("P1", [
      { tipo: "formato", valor: "json", texto: "formato" },
      { tipo: "duracion-max", valor: 5, texto: "duración máxima" },
    ]);
    const resultado: Resultado = { formato: "xml", duracionS: 10 };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toHaveLength(2);
    expect(verificacion.pendientes).toHaveLength(0);
  });

  it("permite criterios múltiples y verifica cada uno", () => {
    const paso = crearPaso("P1", [
      { tipo: "formato", valor: "json", texto: "formato" },
      { tipo: "duracion-max", valor: 10, texto: "duración máxima" },
      { tipo: "tamano-max", valor: 1024, texto: "tamaño máximo" },
    ]);
    const resultado: Resultado = { formato: "json", duracionS: 5, bytes: 512 };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(true);
    expect(verificacion.fallos).toHaveLength(0);
    expect(verificacion.pendientes).toHaveLength(0);
  });

  it("rechaza cuando hay un tipo de criterio no implementado", () => {
    const paso = crearPaso("P1", [
      { tipo: "formato", valor: "json", texto: "formato" },
      { tipo: "desconocido" as "desconocido", texto: "desconocido" },
    ]);
    const resultado: Resultado = { formato: "json" };
    const quien: Quien = { id: "U001", tipo: "pruebas" };

    const verificacion = verificarPaso(paso, resultado, quien, "U002");

    expect(verificacion.ok).toBe(false);
    expect(verificacion.fallos).toContain("tipo de criterio no implementado: desconocido");
  });
});

describe("siguienteIntento", () => {
  it("devuelve 'reintentar' cuando intentos < LIMITES.intentos", () => {
    expect(siguienteIntento(0)).toBe("reintentar");
    expect(siguienteIntento(1)).toBe("reintentar");
  });

  it("devuelve 'necesita-mano' cuando intentos >= LIMITES.intentos", () => {
    expect(siguienteIntento(2)).toBe("necesita-mano");
    expect(siguienteIntento(3)).toBe("necesita-mano");
    expect(siguienteIntento(10)).toBe("necesita-mano");
  });
});
