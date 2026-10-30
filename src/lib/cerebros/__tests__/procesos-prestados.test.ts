import { describe, it, expect } from "vitest";
import { resumenPrestamos } from "../procesos-prestados";

describe("resumenPrestamos", () => {
  it("debe resumir préstamos correctamente", () => {
    const ahora = Date.now();
    const dados = [
      { quien: "Neurona A", que: "CPU", desde: ahora - 1000, consumo: 50 }
    ];
    const tomados = [
      { quien: "Neurona B", que: "RAM", desde: ahora - 2000, consumo: 100 }
    ];
    const resultado = resumenPrestamos(dados, tomados, ahora);
    
    expect(resultado.totalSesiones).toBe(2);
    expect(resultado.totalConsumo).toBe(150);
    expect(resultado.filas[0].quien).toBe("Neurona A");
  });
});
