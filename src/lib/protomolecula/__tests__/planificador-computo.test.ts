import { describe, it, expect } from "vitest";
import { elegirComputo, Candidato } from "../planificador-computo";
import type { Ambito } from "../tipos";

describe("planificador-computo", () => {
  const candidatoBase: Candidato = {
    tipo: "navegador",
    neuronaId: undefined,
    libreMB: 1000,
    gpu: false,
    consentimiento: false,
    cuentaPropia: true,
    ocupacion: 0.5,
  };

  it("debe retornar navegador cuando no hay candidatos", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: false,
    };
    const result = elegirComputo(req, []);
    expect(result.destino).toBe("navegador");
    expect(result.motivos).toContain("Sin candidatos tras filtro de ámbito");
  });

  it("debe filtrar por ámbito personal", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: false,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, cuentaPropia: true },
      { ...candidatoBase, cuentaPropia: false },
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("navegador");
    expect(result.motivos).toContain("Ámbito personal: solo neuronas de la misma cuenta");
  });

  it("debe permitir mismo cuenta y consentimiento en ámbito grupal", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "grupo",
      pesado: false,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, cuentaPropia: false, consentimiento: false }, // no pasa
      { ...candidatoBase, cuentaPropia: true, consentimiento: false }, // pasa por cuentaPropia
      { ...candidatoBase, cuentaPropia: false, consentimiento: true }, // pasa por consentimiento
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("navegador");
    expect(result.motivos).toContain("Ámbito grupal/público: neuronas de la misma cuenta o con consentimiento");
  });

  it("debe aplicar filtro de latencia crítica", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: true,
      ambito: "personal" as Ambito,
      pesado: false,
    } as const;
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "nube" }, // no permitido
      { ...candidatoBase, tipo: "neurona-nas" }, // permitido
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("neurona-nas");
    expect(result.motivos).toContain("Latencia crítica: de 2 candidatos, 1 permiten mismo aparato o red local");
  });

  it("debe seleccionar neurona para tarea pesada con GPU requerida", () => {
    const req = {
      memoriaMB: 100,
      gpu: true,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: true,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "neurona-procesador", gpu: true, consentimiento: true, cuentaPropia: true, ocupacion: 0.2, libreMB: 500, neuronaId: "neurona1" },
      { ...candidatoBase, tipo: "neurona-procesador", gpu: false, consentimiento: true, cuentaPropia: true, ocupacion: 0.1, libreMB: 500, neuronaId: "neurona2" }, // no tiene GPU
      { ...candidatoBase, tipo: "nube", gpu: true, consentimiento: true, cuentaPropia: true, ocupacion: 0.3, libreMB: 500 }, // nube no se considera para pesado en esta rama
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("neurona-procesador");
    expect(result.neuronaId).toBe("neurona1");
    expect(result.motivos.some(s => s.startsWith("Tarea pesada: seleccionada neurona"))).toBe(true);
  });

  it("debe caer a nube para tarea pesada sin neurona adecuada", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: true,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "neurona-procesador", gpu: false, consentimiento: false, cuentaPropia: true, ocupacion: 0.5, libreMB: 100, neuronaId: "neurona1" }, // sin consentimiento
      { ...candidatoBase, tipo: "nube", gpu: false, consentimiento: true, cuentaPropia: true, ocupacion: 0.2, libreMB: 500 },
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("nube");
    expect(result.neuronaId).toBeUndefined();
    expect(result.motivos.some(s => s.startsWith("Tarea pesada: sin neurona adecuada, usando nube"))).toBe(true);
  });

  it("debe seleccionar Oracle A1 para tarea ligera sin GPU", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: false,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "oracle-a1", gpu: false, cuentaPropia: true, ocupacion: 0.1, libreMB: 500 },
      { ...candidatoBase, tipo: "nube", gpu: false, cuentaPropia: true, ocupacion: 0.2, libreMB: 500 },
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("oracle-a1");
    expect(result.neuronaId).toBeUndefined();
    expect(result.motivos.some(s => s.startsWith("Tarea ligera: seleccionado Oracle A1"))).toBe(true);
  });

  it("debe seleccionar nube para tarea ligera sin Oracle A1", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: false,
    };
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "nube", gpu: false, cuentaPropia: true, ocupacion: 0.1, libreMB: 500 },
      { ...candidatoBase, tipo: "neurona-nas", gpu: false, cuentaPropia: true, ocupacion: 0.2, libreMB: 500 },
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("nube");
    expect(result.neuronaId).toBeUndefined();
    expect(result.motivos.some(s => s.startsWith("Tarea ligera: seleccionado nube"))).toBe(true);
  });

  it("debe seleccionar navegador como fallback cuando no hay opciones", () => {
    const req = {
      memoriaMB: 100,
      gpu: false,
      latenciaCritica: false,
      ambito: "personal" as Ambito,
      pesado: false,
    };
    // Candidatos que no pasan ningún filtro: por ejemplo, en ámbito personal pero sin cuentaPropia
    const candidatos: Candidato[] = [
      { ...candidatoBase, tipo: "oracle-a1", cuentaPropia: false }, // no pasa el filtro de ámbito personal
    ];
    const result = elegirComputo(req, candidatos);
    expect(result.destino).toBe("navegador");
    expect(result.motivos.some(s => s.startsWith("Sin candidatos tras filtro de ámbito"))).toBe(true);
  });
});
