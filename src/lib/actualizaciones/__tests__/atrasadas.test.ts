import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";

/**
 * Casos de `neuronasAtrasadas` (≥ 12): la neurona al día no aparece, versión
 * ausente, prioridad de motivos, capa sin `ultima` se ignora y orden estable.
 */
describe("neuronasAtrasadas", () => {
  it("doesn’t include neurons that are up-to-date with all layers", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a1",
        nombre: "Neuron A",
        online: true,
        versiones: { datos: "2026.01.01", interfaz: "2026.01.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01", interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(0);
  });

  it("ignores layers that don’t exist in ultima", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a2",
        nombre: "Neuron B",
        online: true,
        versiones: { datos: "2025.12.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("datos");
  });

  it("includes neuron when version is lower than ultima", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a3",
        nombre: "Neuron C",
        online: true,
        versiones: { datos: "2025.12.01", interfaz: "2026.01.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01", interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].neuronaId).toBe("a3");
    expect(atrasos[0].capa).toBe("datos");
    expect(atrasos[0].tiene).toBe("2025.12.01");
    expect(atrasos[0].deberia).toBe("2026.01.01");
  });

  it("includes neuron with missing version (tiene=null)", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a4",
        nombre: "Neuron D",
        online: true,
        versiones: {}
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01", interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(2);
    expect(atrasos[0].motivo).toBe("sin-motivo");
    expect(atrasos[0].tiene).toBeNull();
    expect(atrasos[1].motivo).toBe("sin-motivo");
  });

  it("prioritizes 'fallo' over other reasons", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a5",
        nombre: "Neuron E",
        online: true,
        versiones: { datos: "2025.12.01" },
        fallo: "kernel crash"
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("fallo");
    expect(atrasos[0].texto).toContain("falló");
  });

  it("prioritizes 'offline' over espera-wifi and pospuesta", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a6",
        nombre: "Neuron F",
        online: false,
        versiones: { datos: "2025.12.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("offline");
    expect(atrasos[0].texto).toContain("no está en línea");
  });

  it("prioritizes 'espera-wifi' over pospuesta", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a7",
        nombre: "Neuron G",
        online: true,
        versiones: { datos: "2025.12.01" },
        pospuestaPor: "espera-wifi"
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("espera-wifi");
    expect(atrasos[0].texto).toContain("esperando Wi-Fi");
  });

  it("prioritizes 'pospuesta' over 'manual'", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a8",
        nombre: "Neuron H",
        online: true,
        versiones: { datos: "2025.12.01" },
        pospuestaPor: "llamada"
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("pospuesta");
    expect(atrasos[0].texto).toContain("pospuesta por una llamada");
  });

  it("prioritizes 'manual' over 'sin-motivo'", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a9",
        nombre: "Neuron I",
        online: true,
        versiones: { datos: "2025.12.01" },
        manual: true
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("manual");
    expect(atrasos[0].texto).toContain("en manual");
  });

  it("la neurona al día y sin señales de espera no aparece", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a10",
        nombre: "Neuron J",
        online: true,
        versiones: { datos: "2026.01.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(0);
  });

  it("orders results by neuron name then by layer", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a11",
        nombre: "Neuron B",
        online: true,
        versiones: { datos: "2025.12.01", interfaz: "2025.12.01" }
      },
      {
        neuronaId: "a12",
        nombre: "Neuron A",
        online: true,
        versiones: { datos: "2025.12.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01", interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(4);
    expect(atrasos[0].nombre).toBe("Neuron A");
    expect(atrasos[0].capa).toBe("datos");
    expect(atrasos[1].nombre).toBe("Neuron A");
    expect(atrasos[1].capa).toBe("interfaz");
    expect(atrasos[2].nombre).toBe("Neuron B");
    expect(atrasos[2].capa).toBe("datos");
    expect(atrasos[3].nombre).toBe("Neuron B");
    expect(atrasos[3].capa).toBe("interfaz");
  });

  it("handles empty neuron list", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(0);
  });

  it("handles empty ultima object", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a13",
        nombre: "Neuron K",
        online: true,
        versiones: { datos: "2025.12.01" }
      }
    ];
    const ultima: VersionesPorCapa = {};
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(0);
  });

  it("sin versión declarada: sin-motivo y el texto dice que no la declara", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "b1", nombre: "Sin versión", online: true, versiones: {} },
    ];
    const ultima: VersionesPorCapa = { datos: "2026.10.10", interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(2);
    for (const a of atrasos) {
      expect(a.motivo).toBe("sin-motivo");
      expect(a.tiene).toBeNull();
      expect(a.texto).toContain("no declara qué versión tiene");
    }
  });

  it("con versión conocida y sin señales, el motivo es sin-motivo con texto genérico", () => {
    const atrasos = neuronasAtrasadas(
      [{ neuronaId: "b2", nombre: "Conocida", online: true, versiones: { datos: "2026.10.01" } }],
      { datos: "2026.10.10" },
    );
    expect(atrasos[0].motivo).toBe("sin-motivo");
    expect(atrasos[0].texto).toContain("sin motivo conocido");
  });

  it("fallo gana a offline, a espera-wifi, a pospuesta y a manual", () => {
    const ultima: VersionesPorCapa = { datos: "2026.10.10" };
    const todo: EstadoNeuronaActualizacion = {
      neuronaId: "b3",
      nombre: "Todo",
      online: false,
      versiones: { datos: "2026.10.01" },
      fallo: "disco lleno",
      pospuestaPor: "espera-wifi",
      manual: true,
    };
    expect(neuronasAtrasadas([todo], ultima)[0].motivo).toBe("fallo");
    expect(neuronasAtrasadas([{ ...todo, fallo: undefined }], ultima)[0].motivo).toBe("offline");
    expect(neuronasAtrasadas([{ ...todo, fallo: undefined, online: true }], ultima)[0].motivo).toBe("espera-wifi");
    expect(
      neuronasAtrasadas([{ ...todo, fallo: undefined, online: true, pospuestaPor: "llamada" }], ultima)[0].motivo,
    ).toBe("pospuesta");
    expect(
      neuronasAtrasadas([{ ...todo, fallo: undefined, online: true, pospuestaPor: undefined }], ultima)[0].motivo,
    ).toBe("manual");
  });

  it("offline sin versión da offline, no sin-motivo", () => {
    const atrasos = neuronasAtrasadas(
      [{ neuronaId: "b4", nombre: "Offline", online: false, versiones: {} }],
      { datos: "2026.10.10", interfaz: "2026.10.10" },
    );
    expect(atrasos).toHaveLength(2);
    expect(atrasos.every((a) => a.motivo === "offline")).toBe(true);
  });

  it("versión igual o mayor a la última no es atraso", () => {
    const ultima: VersionesPorCapa = { datos: "2026.10.10" };
    const igual = neuronasAtrasadas([{ neuronaId: "b5", nombre: "Igual", online: true, versiones: { datos: "2026.10.10" } }], ultima);
    const mayor = neuronasAtrasadas([{ neuronaId: "b6", nombre: "Mayor", online: true, versiones: { datos: "2026.10.15" } }], ultima);
    expect(igual).toHaveLength(0);
    expect(mayor).toHaveLength(0);
  });

  it("solo una capa atrasada entre varias presentes", () => {
    const ultima: VersionesPorCapa = { datos: "2026.10.10", interfaz: "2026.10.10", sw: "2026.10.10" };
    const atrasos = neuronasAtrasadas(
      [{ neuronaId: "b7", nombre: "Parcial", online: true, versiones: { datos: "2026.10.10", interfaz: "2026.10.05", sw: "2026.10.10" } }],
      ultima,
    );
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("interfaz");
    expect(atrasos[0].motivo).toBe("sin-motivo");
  });

  it("el texto nombra la neurona, la capa, las versiones y el motivo en español", () => {
    const atrasos = neuronasAtrasadas(
      [{ neuronaId: "b8", nombre: "Pixel", online: true, versiones: { interfaz: "2026.10.01" }, pospuestaPor: "espera-wifi" }],
      { interfaz: "2026.10.10" },
    );
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].texto).toContain("Pixel");
    expect(atrasos[0].texto).toContain("2026.10.01");
    expect(atrasos[0].texto).toContain("2026.10.10");
    expect(atrasos[0].texto).toContain("esperando Wi-Fi");
  });

  it("mismo nombre: desempata por id de neurona y respeta el orden de capas", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "2", nombre: "Beta", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "3", nombre: "Alpha", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "1", nombre: "Alpha", online: true, versiones: { datos: "2026.10.01" } },
    ];
    const ultima: VersionesPorCapa = { datos: "2026.10.10", interfaz: "2026.10.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.map((a) => `${a.neuronaId}:${a.capa}`)).toEqual([
      "1:datos", "1:interfaz", "3:datos", "3:interfaz", "2:datos", "2:interfaz",
    ]);
  });
});