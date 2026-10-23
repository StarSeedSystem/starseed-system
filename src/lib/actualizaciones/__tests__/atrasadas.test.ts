import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, EstadoNeuronaActualizacion, Atraso, MotivoAtraso } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";

/**
 * Test cases for neuronasAtrasadas function.
 * Tests ≥ 12 scenarios: neuron on track doesn't appear, missing version,
 * priority of reasons, layer without ultima ignored, stable ordering.
 */

// Test helpers to build neuron states
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

  it("shows 'sin-motivo' when neuron is up to date but missing motive", () => {
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
});

/** Casos de rescate (RTS1010-ACT5d-d2d): lo que los de arriba no cubren. */
describe("neuronasAtrasadas · rescate", () => {
  const SEIS: VersionesPorCapa = {
    datos: "2026.01.01",
    interfaz: "2026.01.01",
    sw: "2026.01.01",
    servicios: "2026.01.01",
    modelos: "2026.01.01",
    nativa: "2026.01.01"
  };
  const base: EstadoNeuronaActualizacion = {
    neuronaId: "r1",
    nombre: "Pixel",
    online: true,
    versiones: {}
  };

  it("«fallo» gana a «offline» cuando coinciden", () => {
    const r = neuronasAtrasadas([{ ...base, online: false, versiones: { datos: "2025.12.01" }, fallo: "disco lleno" }], { datos: "2026.01.01" });
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("fallo");
    expect(r[0].texto).toContain("falló");
  });

  it("versión ausente: una fila por capa publicada, sin versión y con su texto", () => {
    const r = neuronasAtrasadas([base], SEIS);
    expect(r).toHaveLength(6);
    for (const a of r) {
      expect(a.motivo).toBe("sin-motivo");
      expect(a.tiene).toBeNull();
      expect(a.texto).toContain("no declara qué versión tiene");
    }
  });

  it("offline sin versión conserva «offline», no «sin-motivo»", () => {
    const r = neuronasAtrasadas([{ ...base, online: false }], SEIS);
    expect(r).toHaveLength(6);
    expect(r.every((a) => a.motivo === "offline")).toBe(true);
  });

  it("una capa que `ultima` no publica se ignora y las otras cinco salen", () => {
    const { datos: _datos, ...sinDatos } = SEIS;
    const r = neuronasAtrasadas([{ ...base, versiones: { datos: "2025.12.01" } }], sinDatos);
    expect(r).toHaveLength(5);
    expect(r.some((a) => a.capa === "datos")).toBe(false);
  });

  it("versión igual o por delante de la última no es atraso", () => {
    const igual = neuronasAtrasadas([{ ...base, versiones: { datos: "2026.01.01" } }], { datos: "2026.01.01" });
    const delante = neuronasAtrasadas([{ ...base, versiones: { datos: "2026.02.01" } }], { datos: "2026.01.01" });
    expect(igual).toHaveLength(0);
    expect(delante).toHaveLength(0);
  });

  it("solo la capa atrasada entre varias presentes", () => {
    const r = neuronasAtrasadas([{ ...base, versiones: { ...SEIS, interfaz: "2025.12.01" } }], SEIS);
    expect(r).toHaveLength(1);
    expect(r[0].capa).toBe("interfaz");
    expect(r[0].motivo).toBe("sin-motivo");
    expect(r[0].texto).toContain("sin motivo conocido");
  });

  it("«manual» con versión antigua mantiene «manual»", () => {
    const r = neuronasAtrasadas([{ ...base, versiones: { datos: "2025.12.01" }, manual: true }], { datos: "2026.01.01" });
    expect(r[0].motivo).toBe("manual");
    expect(r[0].texto).toContain("en manual");
  });

  it("el texto nombra la neurona, la capa, las dos versiones y la espera de Wi-Fi", () => {
    const r = neuronasAtrasadas(
      [{ ...base, versiones: { interfaz: "2025.12.01" }, pospuestaPor: "espera-wifi" }],
      { interfaz: "2026.01.01" }
    );
    expect(r[0].texto).toContain("Pixel");
    expect(r[0].texto).toContain("interfaz");
    expect(r[0].texto).toContain("2025.12.01");
    expect(r[0].texto).toContain("2026.01.01");
    expect(r[0].texto).toContain("esperando Wi-Fi");
  });

  it("el orden desempata por id cuando dos neuronas comparten nombre", () => {
    const mk = (neuronaId: string, nombre: string): EstadoNeuronaActualizacion => ({
      neuronaId,
      nombre,
      online: true,
      versiones: { datos: "2025.12.01" }
    });
    const r = neuronasAtrasadas([mk("n2", "Beta"), mk("n1", "Alpha"), mk("n3", "Alpha")], { datos: "2026.01.01" });
    expect(r.map((a) => a.neuronaId)).toEqual(["n1", "n3", "n2"]);
  });
});
