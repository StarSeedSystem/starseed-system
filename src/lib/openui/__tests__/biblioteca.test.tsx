import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RespuestaViva, esInterfazViva } from "@/components/openui/respuesta-viva";
import { biblioteca, promptDeSistema } from "../biblioteca";

// Identificadores ASCII: el lexer de OpenUI Lang solo acepta [A-Za-z0-9_].
const NOMBRES = [
  "Tarjeta",
  "Tabla",
  "Pasos",
  "Comparacion",
  "LineaDeTiempo",
  "Lista",
  "Accion",
];

describe("biblioteca OpenUI de StarSeed", () => {
  it("expone los siete componentes Trinity", () => {
    expect(Object.keys(biblioteca.components).sort()).toEqual([...NOMBRES].sort());
  });

  it("genera el prompt desde la biblioteca y nombra los siete componentes", () => {
    const prompt = promptDeSistema();

    for (const nombre of NOMBRES) {
      expect(prompt).toContain(nombre);
    }
    expect(prompt).toContain("Tarjeta(");
    expect(prompt).toContain("Accion(");
  });

  it("declara las props de cada componente en su JSON Schema", () => {
    const defs = biblioteca.toJSONSchema().$defs ?? {};

    for (const nombre of NOMBRES) {
      expect(defs[nombre]).toBeTruthy();
    }
  });
});

describe("detección de respuesta viva", () => {
  it("reconoce un programa que empieza por root = cualquiera de los siete", () => {
    for (const nombre of NOMBRES) {
      expect(esInterfazViva(`root = ${nombre}()`)).toBe(true);
    }
  });

  it("acepta el programa entero dentro de un bloque de código", () => {
    expect(esInterfazViva("```openui\nroot = LineaDeTiempo([])\n```")).toBe(true);
  });

  it("no secuestra prosa, vacío ni un bloque suelto dentro de markdown", () => {
    expect(esInterfazViva("")).toBe(false);
    expect(esInterfazViva("# Hola\n\nEsto es texto normal")).toBe(false);
    expect(esInterfazViva("Mira:\n\n```\nroot = Tarjeta([])\n```")).toBe(false);
  });

  it("pinta una LineaDeTiempo con la biblioteca Trinity", async () => {
    render(<RespuestaViva texto={'root = LineaDeTiempo([{fecha: "2026-11-05", titulo: "Hito"}])'} />);
    expect(await screen.findByText("Hito")).toBeTruthy();
  });
});
