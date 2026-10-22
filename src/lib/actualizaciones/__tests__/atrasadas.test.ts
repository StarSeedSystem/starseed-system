import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";

/**
 * Casos de `neuronasAtrasadas` (≥ 18): la neurona al día no aparece, versión
 * ausente, prioridad de motivos, capa sin `ultima` se ignora y orden estable.
 */
describe("neuronasAtrasadas", () => {
  /** Un manifiesto con las seis capas al día: sirve de «última versión conocida». */
  const ULTIMA: VersionesPorCapa = {
    datos: "2026.10.10",
    interfaz: "2026.10.10",
    sw: "2026.10.10",
    servicios: "2026.10.10",
    modelos: "2026.10.10",
    nativa: "2026.10.10",
  };

  /** El mismo manifiesto, pero sin la capa `datos`: esa capa no se mira. */
  const ULTIMA_SIN_DATOS: VersionesPorCapa = {
    interfaz: "2026.10.10",
    sw: "2026.10.10",
    servicios: "2026.10.10",
    modelos: "2026.10.10",
    nativa: "2026.10.10",
  };

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

  it("ignora una capa que el manifiesto no publica: solo mira las que sí tiene «última»", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a14",
        nombre: "Neuron L",
        online: true,
        // «datos» va por detrás, pero el manifiesto no publica esa capa: no se cuenta.
        versiones: { datos: "2026.10.01" }
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA_SIN_DATOS);
    // Las otras cinco capas no las declara: se avisan, pero «datos» ni se mira.
    expect(atrasos).toHaveLength(5);
    expect(atrasos.every((a) => a.capa !== "datos")).toBe(true);
    expect(atrasos.map((a) => a.capa)).toEqual(["interfaz", "sw", "servicios", "modelos", "nativa"]);
  });

  it("una versión más nueva que la última no es un atraso", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a15",
        nombre: "Neuron Adelantada",
        online: true,
        versiones: { datos: "2026.10.15" }
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA);
    expect(atrasos.some((a) => a.capa === "datos")).toBe(false);
    // Las cinco capas que no declara sí se avisan: solo «datos» queda fuera.
    expect(atrasos).toHaveLength(5);
  });

  it("solo una capa atrasada entre varias al día", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a16",
        nombre: "Neuron Parcial",
        online: true,
        versiones: {
          datos: "2026.10.10",
          interfaz: "2026.10.05",
          sw: "2026.10.10",
          servicios: "2026.10.10",
          modelos: "2026.10.10",
          nativa: "2026.10.10"
        }
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA);
    expect(atrasos).toHaveLength(1);
    expect(atrasos[0].capa).toBe("interfaz");
    expect(atrasos[0].tiene).toBe("2026.10.05");
    expect(atrasos[0].deberia).toBe("2026.10.10");
    // Dice la versión que tiene, así que no hay motivo conocido: solo está por detrás.
    expect(atrasos[0].motivo).toBe("sin-motivo");
  });

  it("sin versión y fuera de línea, el motivo es «offline» y no «sin-motivo»", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a17",
        nombre: "Neuron Offline",
        online: false,
        versiones: {}
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA);
    expect(atrasos).toHaveLength(6);
    expect(atrasos.every((a) => a.motivo === "offline")).toBe(true);
    expect(atrasos[0].tiene).toBeNull();
  });

  it("orden estable: por nombre, luego por id, y las capas en el orden del manifiesto", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "2",
        nombre: "Beta",
        online: true,
        versiones: { datos: "2026.10.01" }
      },
      {
        neuronaId: "1",
        nombre: "Alpha",
        online: true,
        versiones: { datos: "2026.10.01" }
      },
      {
        neuronaId: "3",
        nombre: "Alpha", // mismo nombre, otro id
        online: true,
        versiones: { datos: "2026.10.01" }
      }
    ];
    const atrasos = neuronasAtrasadas(neuronas, ULTIMA);
    // Tres neuronas × seis capas = dieciocho avisos.
    expect(atrasos).toHaveLength(18);
    // A igual nombre, manda el id: primero Alpha (1), luego Alpha (3), y al final Beta (2).
    for (let i = 0; i < 6; i++) {
      expect(atrasos[i].neuronaId).toBe("1");
      expect(atrasos[i].nombre).toBe("Alpha");
    }
    for (let i = 6; i < 12; i++) {
      expect(atrasos[i].neuronaId).toBe("3");
      expect(atrasos[i].nombre).toBe("Alpha");
    }
    for (let i = 12; i < 18; i++) {
      expect(atrasos[i].neuronaId).toBe("2");
      expect(atrasos[i].nombre).toBe("Beta");
    }
    // Y dentro de cada neurona, las capas van en el orden del manifiesto.
    expect(atrasos[0].capa).toBe("datos");
    expect(atrasos[5].capa).toBe("nativa");
  });
});
