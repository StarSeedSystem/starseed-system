import { describe, it, expect } from "vitest";
import { elegirComputo, Candidato } from "../planificador-computo";

describe("planificador-computo", () => {
  it("debe existir la función elegirComputo", () => {
    expect(typeof elegirComputo).toBe("function");
  });

  it("debe devolver un objeto con destino y motivos", () => {
     const req = {
       memoriaMB: 100,
       gpu: false,
       latenciaCritica: false,
       ambito: "personal" as const,
       pesado: false,
     };
    const candidatos: Candidato[] = [
      {
        tipo: "navegador",
        libreMB: 1024,
        gpu: false,
        consentimiento: false,
        cuentaPropia: true,
        ocupacion: 0,
      },
    ];
    const result = elegirComputo(req, candidatos);
    expect(result).toHaveProperty("destino");
    expect(result).toHaveProperty("motivos");
    expect(Array.isArray(result.motivos)).toBe(true);
  });
});
