import { describe, it, expect } from "vitest";
import { validarPaquete } from "../validar";

describe("validarPaquete", () => {
  it("debe validar un paquete correcto", async () => {
    const paqueteValido = {
      codigo: "es-ES",
      dir: "ltr",
      version: "1.0",
      autor: { nombre: "Autor" },
      revisado: { estado: "manual" },
      hash: "abc",
      entradas: { "hola": "Hola" }
    };
    const resultado = await validarPaquete(paqueteValido, { digest: "abc" });
    if (resultado.ok) {
      expect(resultado.paquete.codigo).toBe("es-ES");
      expect(resultado.paquete.revisado.estado).toBe("automatico");
      expect(resultado.avisos.length).toBe(1);
    } else {
      throw new Error("Debería ser válido");
    }
  });

  it("debe rechazar claves prohibidas", async () => {
    const paqueteMal = {
      codigo: "es-ES",
      dir: "ltr",
      entradas: { "__proto__": "hack" }
    };
    const resultado = await validarPaquete(paqueteMal, { digest: "hash" });
    expect(resultado.ok).toBe(false);
  });
});
