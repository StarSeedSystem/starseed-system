import { describe, it, expect } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion } from "../atrasadas";
import type { VersionesPorCapa } from "../capas";
import { CAPAS_ORDEN } from "../manifiesto";

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
});

/**
 * Casos rescatados de la rama archivada nube/39662663331 (RTS1010-ACT5d-d2b):
 * versión adelantada, `ultima` parcial, señales combinadas y desempate por id.
 */
describe("neuronasAtrasadas · rescate rama nube", () => {
  const dummyUltima: VersionesPorCapa = {
    datos: "2026.10.10",
    interfaz: "2026.10.10",
    sw: "2026.10.10",
    servicios: "2026.10.10",
    modelos: "2026.10.10",
    nativa: "2026.10.10",
  };

  it("versión mayor a la última no es atraso en esa capa", () => {
    const neuron: EstadoNeuronaActualizacion = {
      neuronaId: "b1",
      nombre: "Adelantada",
      online: true,
      versiones: { datos: "2026.10.15" },
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result.some((r) => r.capa === "datos")).toBe(false);
    expect(result).toHaveLength(5);
  });

  it("capa ausente en ultima se ignora aunque la neurona la declare", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "b2",
        nombre: "Parcial",
        online: true,
        versiones: { datos: "2026.10.01" },
      },
    ];
    const ultimaSinDatos: VersionesPorCapa = {
      interfaz: dummyUltima.interfaz,
      sw: dummyUltima.sw,
      servicios: dummyUltima.servicios,
      modelos: dummyUltima.modelos,
      nativa: dummyUltima.nativa,
    };
    const result = neuronasAtrasadas(neuronas, ultimaSinDatos);
    expect(result).toHaveLength(5);
    result.forEach((atraso) => expect(atraso.capa).not.toBe("datos"));
  });

  it("prioridad de señales combinadas: fallo > offline > espera-wifi > pospuesta > manual", () => {
    const base = {
      neuronaId: "b3",
      nombre: "Señales",
      online: true,
      versiones: { datos: "2026.10.01" },
    };
    const conTodo = { ...base, online: false, fallo: "kernel", pospuestaPor: "espera-wifi" as const, manual: true };
    expect(neuronasAtrasadas([conTodo], dummyUltima)[0].motivo).toBe("fallo");
    const offlineYMas = { ...base, online: false, pospuestaPor: "espera-wifi" as const, manual: true };
    expect(neuronasAtrasadas([offlineYMas], dummyUltima)[0].motivo).toBe("offline");
    const wifiYManual = { ...base, pospuestaPor: "espera-wifi" as const, manual: true };
    expect(neuronasAtrasadas([wifiYManual], dummyUltima)[0].motivo).toBe("espera-wifi");
    const pospuestaYManual = { ...base, pospuestaPor: "llamada" as const, manual: true };
    expect(neuronasAtrasadas([pospuestaYManual], dummyUltima)[0].motivo).toBe("pospuesta");
  });

  it("offline sin versión da «offline», no «sin-motivo»", () => {
    const neuron: EstadoNeuronaActualizacion = {
      neuronaId: "b4",
      nombre: "Offline muda",
      online: false,
      versiones: {},
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result).toHaveLength(6);
    expect(result.every((r) => r.motivo === "offline")).toBe(true);
  });

  it("texto de sin-motivo: sin versión y versión atrás sin señales", () => {
    const sinVersion: EstadoNeuronaActualizacion = {
      neuronaId: "b5",
      nombre: "Muda",
      online: true,
      versiones: {},
    };
    const sinVersionResult = neuronasAtrasadas([sinVersion], dummyUltima);
    expect(sinVersionResult).toHaveLength(6);
    sinVersionResult.forEach((atraso) => {
      expect(atraso.motivo).toBe("sin-motivo");
      expect(atraso.tiene).toBeNull();
      expect(atraso.texto).toContain("no declara qué versión tiene");
    });

    const sinSenales: EstadoNeuronaActualizacion = {
      neuronaId: "b6",
      nombre: "Pixel",
      online: true,
      versiones: { datos: "2026.10.01" },
    };
    const datos = neuronasAtrasadas([sinSenales], dummyUltima).find((r) => r.capa === "datos");
    expect(datos?.motivo).toBe("sin-motivo");
    expect(datos?.texto).toContain("Pixel");
    expect(datos?.texto).toContain("datos");
    expect(datos?.texto).toContain("2026.10.01");
    expect(datos?.texto).toContain("2026.10.10");
    expect(datos?.texto).toContain("sin motivo conocido");
  });

  it("orden estable: nombre y, a igualdad, neuronaId; capas en orden de aplicación", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "b9", nombre: "Beta", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "b7", nombre: "Alfa", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "b8", nombre: "Alfa", online: true, versiones: { datos: "2026.10.01" } },
    ];
    const result = neuronasAtrasadas(neuronas, dummyUltima);
    expect(result).toHaveLength(18);
    expect(result[0].neuronaId).toBe("b7");
    expect(result[5].neuronaId).toBe("b7");
    expect(result[6].neuronaId).toBe("b8");
    expect(result[11].neuronaId).toBe("b8");
    expect(result[12].neuronaId).toBe("b9");
    expect(result[17].neuronaId).toBe("b9");
    result.forEach((atraso, i) => {
      expect(atraso.capa).toBe(CAPAS_ORDEN[i % CAPAS_ORDEN.length]);
    });
  });
});