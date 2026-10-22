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

  it("versión mayor a la última no es atraso", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a14",
        nombre: "Adelantada",
        online: true,
        versiones: { datos: "2026.01.15" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(0);
  });

  it("solo una capa atrasada entre las seis declaradas queda sin motivo conocido", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a15",
        nombre: "Parcial",
        online: true,
        versiones: {
          datos: "2026.01.10",
          interfaz: "2026.01.05",
          sw: "2026.01.10",
          servicios: "2026.01.10",
          modelos: "2026.01.10",
          nativa: "2026.01.10"
        }
      }
    ];
    const ultima: VersionesPorCapa = {
      datos: "2026.01.10",
      interfaz: "2026.01.10",
      sw: "2026.01.10",
      servicios: "2026.01.10",
      modelos: "2026.01.10",
      nativa: "2026.01.10"
    };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("interfaz");
    expect(atrasos[0].motivo).toBe("sin-motivo");
    expect(atrasos[0].texto).toContain("sin motivo conocido");
  });

  it("mismo nombre desempata por neuronaId y mantiene el bloque de capas", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a17",
        nombre: "Aurora",
        online: true,
        versiones: { datos: "2026.01.01", interfaz: "2026.01.01" }
      },
      {
        neuronaId: "a16",
        nombre: "Aurora",
        online: true,
        versiones: { datos: "2026.01.01", interfaz: "2026.01.01" }
      },
      {
        neuronaId: "a18",
        nombre: "Borja",
        online: true,
        versiones: { datos: "2026.01.01", interfaz: "2026.01.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.10", interfaz: "2026.01.10" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(6);
    expect(atrasos.slice(0, 2).map((a) => a.neuronaId)).toEqual(["a16", "a16"]);
    expect(atrasos.slice(2, 4).map((a) => a.neuronaId)).toEqual(["a17", "a17"]);
    expect(atrasos.slice(4).map((a) => a.neuronaId)).toEqual(["a18", "a18"]);
    expect(atrasos[0].capa).toBe("datos");
    expect(atrasos[1].capa).toBe("interfaz");
  });

  it("versión ausente: las seis capas quedan en sin-motivo y el texto dice que no declara qué versión tiene", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a19",
        nombre: "Recién llegada",
        online: true,
        versiones: {}
      }
    ];
    const ultima: VersionesPorCapa = {
      datos: "2026.01.10",
      interfaz: "2026.01.10",
      sw: "2026.01.10",
      servicios: "2026.01.10",
      modelos: "2026.01.10",
      nativa: "2026.01.10"
    };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(6);
    expect(atrasos.every((a) => a.motivo === "sin-motivo" && a.tiene === null)).toBe(true);
    expect(atrasos.every((a) => a.texto.includes("no declara qué versión tiene"))).toBe(true);
  });
});