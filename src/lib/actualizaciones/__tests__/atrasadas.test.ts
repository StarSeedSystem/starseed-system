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
 * Casos rescatados de la rama de la nube: la versión adelantada no es atraso, una
 * sola capa atrasada entre las que la neurona declara, «offline» manda sobre
 * «sin-motivo» y, a igualdad de nombre, el desempate es por id.
 */
describe("neuronasAtrasadas · rescate de la rama de la nube", () => {
  const dummyUltima: VersionesPorCapa = {
    datos: "2026.10.10",
    interfaz: "2026.10.10",
    sw: "2026.10.10",
    servicios: "2026.10.10",
    modelos: "2026.10.10",
    nativa: "2026.10.10",
  };

  it("una versión más nueva que la última no es atraso en esa capa", () => {
    const neurona: EstadoNeuronaActualizacion = {
      neuronaId: "b1",
      nombre: "Adelantada",
      online: true,
      versiones: { datos: "2026.10.15" },
    };
    const resultado = neuronasAtrasadas([neurona], dummyUltima);
    expect(resultado.some((r) => r.capa === "datos")).toBe(false);
    // Las otras cinco capas sí se avisan: esa neurona no las declara.
    expect(resultado).toHaveLength(5);
  });

  it("solo una capa atrasada entre las que la neurona declara", () => {
    const neurona: EstadoNeuronaActualizacion = {
      neuronaId: "b2",
      nombre: "Parcial",
      online: true,
      versiones: {
        datos: "2026.10.10",
        interfaz: "2026.10.05",
        sw: "2026.10.10",
        servicios: "2026.10.10",
        modelos: "2026.10.10",
        nativa: "2026.10.10",
      },
    };
    const resultado = neuronasAtrasadas([neurona], dummyUltima);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].capa).toBe("interfaz");
    expect(resultado[0].motivo).toBe("sin-motivo");
  });

  it("offline sin versión: manda «offline», no «sin-motivo»", () => {
    const neurona: EstadoNeuronaActualizacion = {
      neuronaId: "b3",
      nombre: "Offline muda",
      online: false,
      versiones: {},
    };
    const resultado = neuronasAtrasadas([neurona], dummyUltima);
    expect(resultado).toHaveLength(6);
    expect(resultado.every((r) => r.motivo === "offline")).toBe(true);
  });

  it("orden estable: por nombre, luego por id, y las capas en su orden", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      { neuronaId: "2", nombre: "Beta", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "1", nombre: "Alpha", online: true, versiones: { datos: "2026.10.01" } },
      { neuronaId: "3", nombre: "Alpha", online: true, versiones: { datos: "2026.10.01" } },
    ];
    const resultado = neuronasAtrasadas(neuronas, dummyUltima);
    // Tres neuronas × seis capas: cada neurona avisa de la que va atrás y de las que no declara.
    expect(resultado).toHaveLength(18);
    for (let i = 0; i < 6; i++) {
      expect(resultado[i].neuronaId).toBe("1");
      expect(resultado[i].nombre).toBe("Alpha");
    }
    for (let i = 6; i < 12; i++) {
      expect(resultado[i].neuronaId).toBe("3");
      expect(resultado[i].nombre).toBe("Alpha");
    }
    for (let i = 12; i < 18; i++) {
      expect(resultado[i].neuronaId).toBe("2");
      expect(resultado[i].nombre).toBe("Beta");
    }
    // Dentro de cada neurona, las capas salen en el orden en que se aplican.
    resultado.forEach((atraso, i) => {
      expect(atraso.capa).toBe(CAPAS_ORDEN[i % CAPAS_ORDEN.length]);
    });
  });
});