import { describe, expect, it } from "vitest";

import {
  leerObjeciones,
  promptDePez,
  veredicto,
  type Objecion,
} from "../peces";

describe("promptDePez", () => {
  it("devuelve un prompt que menciona el tipo de artefacto", () => {
    const artefacto = {
      contenido: "Contenido de prueba",
      tipo: "respuesta" as const,
    };
    const prompt = promptDePez(artefacto, "respuesta");
    expect(prompt).toContain("respuesta larga");
    expect(prompt).toContain("revisor sin contexto");
  });

  it("incluye el contenido del artefacto", () => {
    const artefacto = {
      contenido: "Este es el texto del artefacto a revisar",
      tipo: "plan" as const,
    };
    const prompt = promptDePez(artefacto, "plan");
    expect(prompt).toContain("Este es el texto del artefacto a revisar");
  });

  it("cita el formato requerido para objeciones", () => {
    const artefacto = { contenido: "x", tipo: "ola" as const };
    const prompt = promptDePez(artefacto, "ola");
    expect(prompt).toContain("[bloquea|importa|menor]");
    expect(prompt).toContain("línea problematica");
  });
});

describe("leerObjeciones", () => {
  it("extrae objeciones con gravedad válida", () => {
    const texto = `[bloquea] Falta el punto final
[importa] Esta variable no está tipada
[menor] El color no sigue la paleta`
    const resultado = leerObjeciones(texto);
    expect(resultado).toHaveLength(3);
    expect(resultado[0]).toEqual({ gravedad: "bloquea", texto: "Falta el punto final" });
    expect(resultado[1]).toEqual({ gravedad: "importa", texto: "Esta variable no está tipada" });
    expect(resultado[2]).toEqual({ gravedad: "menor", texto: "El color no sigue la paleta" });
  });

  it("ignora líneas sin gravedad", () => {
    const texto = `Algun texto sin formato
[bloquea] Esta es una objecion
Texto adicional sin formato`;
    const resultado = leerObjeciones(texto);
    expect(resultado).toHaveLength(1);
  });

  it("ignora líneas vacías", () => {
    const texto = `[bloquea] Primer error


[importa] Segundo error`;
    const resultado = leerObjeciones(texto);
    expect(resultado).toHaveLength(2);
  });

  it("elimina duplicados manteniendo el orden", () => {
    const texto = `[bloquea] Error repetido
[importa] Unico
[bloquea] Error repetido`;
    const resultado = leerObjeciones(texto);
    expect(resultado).toHaveLength(2);
    expect(resultado.find((o) => o.texto === "Error repetido")).toBeDefined();
  });

  it("es tolerante con mayúsculas en la gravedad", () => {
    const texto = `[BLOQUEA] Error en mayúscula
[IMPORTA] Otro en mayúscula`;
    const resultado = leerObjeciones(texto);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].gravedad).toBe("bloquea");
    expect(resultado[1].gravedad).toBe("importa");
  });
});

describe("veredicto", () => {
  it("pasa cuando no hay objeciones bloqueantes", () => {
    const objeciones: Objecion[] = [
      { gravedad: "menor", texto: "Espaciado" },
      { gravedad: "importa", texto: "Falta comentario" },
    ];
    const resultado = veredicto(objeciones);
    expect(resultado.pasa).toBe(true);
    expect(resultado.bloqueantes).toHaveLength(0);
  });

  it("pasa cuando no hay objeciones", () => {
    const resultado = veredicto([]);
    expect(resultado.pasa).toBe(true);
    expect(resultado.bloqueantes).toHaveLength(0);
  });

  it("no pasa cuando hay objeciones bloqueantes", () => {
    const objeciones: Objecion[] = [
      { gravedad: "menor", texto: "Espaciado" },
      { gravedad: "bloquea", texto: "Error de sintaxis" },
      { gravedad: "importa", texto: "Falta tipado" },
      { gravedad: "bloquea", texto: "Variable sin inicializar" },
    ];
    const resultado = veredicto(objeciones);
    expect(resultado.pasa).toBe(false);
    expect(resultado.bloqueantes).toHaveLength(2);
    expect(resultado.bloqueantes.map((o) => o.texto)).toEqual([
      "Error de sintaxis",
      "Variable sin inicializar",
    ]);
  });

  it("devuelve solo las objeciones bloqueantes en el campo bloqueantes", () => {
    const objeciones: Objecion[] = [
      { gravedad: "bloquea", texto: "Critical" },
      { gravedad: "menor", texto: "Minor" },
      { gravedad: "importa", texto: "Importa" },
      { gravedad: "bloquea", texto: "Critical 2" },
    ];
    const resultado = veredicto(objeciones);
    expect(resultado.bloqueantes).toEqual([
      { gravedad: "bloquea", texto: "Critical" },
      { gravedad: "bloquea", texto: "Critical 2" },
    ]);
  });
});