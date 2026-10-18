import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";

describe("neuronasAtrasadas", () => {
  it("neurona al día no aparece", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Pixel",
        online: true,
        versiones: { interfaz: "2026.10.10" },
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    expect(neuronasAtrasadas(neuronas, ultima)).toEqual([]);
  });

  it("versión ausente (no declara) aparece con tiene=nulo", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Tensor",
        online: true,
        versiones: {},
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.length).toBe(1);
    expect(atrasos[0].tiene).toBe(null);
    expect(atrasos[0].motivo).toBe("sin-dato");
  });

  it("prioridad fallo sobre todo", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Helix",
        online: false,
        versiones: { interfaz: "2026.9.01" },
        fallo: "crc falló",
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].motivo).toBe("fallo");
    expect(atrasos[0].texto).toContain("falló: crc falló");
  });

  it("prioridad offline sobre espera-wifi", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Spark",
        online: false,
        versiones: { interfaz: "2026.9.01" },
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].motivo).toBe("offline");
    expect(atrasos[0].texto).toContain("no está en línea");
  });

  it("prioridad espera-wifi sobre pospuesta", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Nova",
        online: true,
        versiones: { interfaz: "2026.9.01" },
        pospuestaPor: "espera-wifi",
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].motivo).toBe("espera-wifi");
    expect(atrasos[0].texto).toContain("esperando Wi-Fi");
  });

  it("prioridad pospuesta sobre manual", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Cortex",
        online: true,
        versiones: { interfaz: "2026.9.01" },
        pospuestaPor: "llamada",
        manual: true,
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].motivo).toBe("pospuesta");
    expect(atrasos[0].texto).toContain("pospuesta por una llamada");
  });

  it("prioridad manual sobre sin-motivo", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Neuron",
        online: true,
        versiones: { interfaz: "2026.9.01" },
        manual: true,
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].motivo).toBe("manual");
    expect(atrasos[0].texto).toContain("en manual");
  });

  it("sin-motivo cuando todo está bien", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Zero",
        online: true,
        versiones: { interfaz: "2026.9.01" },
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
expect(atrasos[0].motivo).toBe("sin-motivo");
      expect(atrasos[0].texto).toContain("sin motivo conocido");
    });

  it("capa sin ultima se ignora", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Minerva",
        online: true,
        versiones: { interfaz: "2026.9.01" },
      },
    ];
    const ultima: VersionesPorCapa = {};
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.length).toBe(0);
  });

  it("orden estable: nombre y luego capa", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n2",
        nombre: "Alpha",
        online: true,
        versiones: { interfaz: "2026.9.01" },
      },
      {
        neuronaId: "n1",
        nombre: "Alpha",
        online: true,
        versiones: { interfaz: "2026.9.01" },
      },
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.10.10", nativa: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].nombre).toBe("Alpha");
    expect(atrasos[0].capa).toBe("interfaz");
    expect(atrasos[1].nombre).toBe("Alpha");
    expect(atrasos[1].capa).toBe("nativa");
  });

  it("multiple neuronas múltiples capas", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "A",
        online: true,
        versiones: { datos: "2026.9.01", interfaz: "2026.9.01" },
      },
      {
        neuronaId: "n2",
        nombre: "B",
        online: true,
        versiones: { datos: "2026.9.01" },
      },
    ];
    const ultima: VersionesPorCapa = { datos: "2026.10.10", interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.length).toBe(4);
  });

  it("versión en última posición no lanza ni falla", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "n1",
        nombre: "Epsilon",
        online: true,
        versiones: { nativa: "2026.10.10" },
      },
    ];
    const ultima: VersionesPorCapa = { nativa: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.length).toBe(0);
  });
});