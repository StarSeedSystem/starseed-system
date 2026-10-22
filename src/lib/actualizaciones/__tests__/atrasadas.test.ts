import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";

/** Las seis capas con versión publicada: para los casos que miran varias filas por neurona. */
const ULTIMA_SEIS: VersionesPorCapa = {
  datos: "2026.01.01",
  interfaz: "2026.01.01",
  sw: "2026.01.01",
  servicios: "2026.01.01",
  modelos: "2026.01.01",
  nativa: "2026.01.01"
};

/**
 * Casos de `neuronasAtrasadas` (21): la neurona al día no aparece, versión
 * ausente, prioridad de motivos (incluido «fallo» sobre «offline»), capa sin
 * `ultima` se ignora, versión por delante, texto del atraso y orden estable
 * (nombre, luego id).
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

  it("prioritizes 'fallo' over 'offline' cuando ambos coinciden", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a19",
        nombre: "Neuron Fallo y Offline",
        online: false,
        versiones: { datos: "2025.12.01" },
        fallo: "sin espacio en disco"
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].motivo).toBe("fallo");
    expect(atrasos[0].texto).toContain("falló");
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

  it("ignora la neurona cuya versión va por delante de la última", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a14",
        nombre: "Neuron Adelantada",
        online: true,
        // «datos» va por delante de lo publicado; «interfaz» va detrás.
        versiones: { datos: "2026.02.01", interfaz: "2025.12.01" }
      }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01", interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("interfaz");
  });

  it("dice «sin motivo conocido» cuando la versión antigua no tiene otro motivo", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a15",
        nombre: "Neuron Sin Señales",
        online: true,
        versiones: {
          datos: "2026.01.01",
          interfaz: "2025.12.01",
          sw: "2026.01.01",
          servicios: "2026.01.01",
          modelos: "2026.01.01",
          nativa: "2026.01.01"
        }
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA_SEIS);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("interfaz");
    expect(atrasos[0].motivo).toBe("sin-motivo");
    expect(atrasos[0].texto).toContain("sin motivo conocido");
  });

  it("mantiene «offline» como motivo aunque falte la versión", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "a16", nombre: "Neuron Offline", online: false, versiones: {} }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA_SEIS);
    expect(atrasos).toHaveLength(6);
    expect(atrasos.every((a) => a.motivo === "offline")).toBe(true);
    expect(atrasos[0].texto).toContain("no está en línea");
  });

  it("el texto dice la neurona, la capa y las dos versiones", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "a17", nombre: "Pixel", online: true, versiones: { interfaz: "2025.12.01" } }
    ];
    const ultima: VersionesPorCapa = { interfaz: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos[0].texto).toContain("Pixel");
    expect(atrasos[0].texto).toContain("interfaz");
    expect(atrasos[0].texto).toContain("2025.12.01");
    expect(atrasos[0].texto).toContain("2026.01.01");
  });

  it("el texto explica que la versión ausente no está declarada", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "a18", nombre: "Neuron Sin Versión", online: true, versiones: {} }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].tiene).toBeNull();
    expect(atrasos[0].motivo).toBe("sin-motivo");
    expect(atrasos[0].texto).toContain("no declara qué versión tiene");
  });

  it("el orden desempata por id cuando dos neuronas comparten nombre", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "n2", nombre: "Beta", online: true, versiones: { datos: "2025.12.01" } },
      { neuronaId: "n1", nombre: "Alpha", online: true, versiones: { datos: "2025.12.01" } },
      { neuronaId: "n3", nombre: "Alpha", online: true, versiones: { datos: "2025.12.01" } }
    ];
    const ultima: VersionesPorCapa = { datos: "2026.01.01" };
    const atrasos = neuronasAtrasadas(neuronas, ultima);
    expect(atrasos.map((a) => a.neuronaId)).toEqual(["n1", "n3", "n2"]);
    expect(atrasos.map((a) => a.nombre)).toEqual(["Alpha", "Alpha", "Beta"]);
  });
});