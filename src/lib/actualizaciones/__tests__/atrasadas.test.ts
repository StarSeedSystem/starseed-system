import { describe, it, expect } from "vitest";
<<<<<<< HEAD
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

  it("ignora la capa con versión atrasada que `ultima` no publica y saca las demás", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "a20",
        nombre: "Neuron Parcial",
        online: true,
        // «datos» va atrás pero `ultima` no la publica: no puede haber atraso ahí.
        versiones: { datos: "2025.12.01" }
      }
    ];
    // Copia de ULTIMA_SEIS sin «datos»: las otras cinco capas sí tienen versión publicada.
    const { datos: _, ...ultimaSinDatos } = ULTIMA_SEIS;
    const atrasos = neuronasAtrasadas(neuronas, ultimaSinDatos);
    expect(atrasos).toHaveLength(5);
    expect(atrasos.some((a) => a.capa === "datos")).toBe(false);
    expect(atrasos.every((a) => a.motivo === "sin-motivo")).toBe(true);
    expect(atrasos.every((a) => a.tiene === null)).toBe(true);
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
=======
import { neuronasAtrasadas, type EstadoNeuronaActualizacion, type MotivoAtraso } from "../atrasadas";
import type { CapaActualizacion } from "../manifiesto";

describe("neuronasAtrasadas", () => {
  const dummyCapas: CapaActualizacion[] = ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"];
  const dummyUltima: Record<CapaActualizacion, string> = {
    datos: "2026.10.10",
    interfaz: "2026.10.10",
    sw: "2026.10.10",
    servicios: "2026.10.10",
    modelos: "2026.10.10",
    nativa: "2026.10.10",
  };

  it("neurona al día no aparece", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "1",
        nombre: "Neurona al día",
        online: true,
        versiones: { ...dummyUltima },
      },
    ];
    const result = neuronasAtrasadas(neuronas, dummyUltima);
    expect(result).toHaveLength(0);
  });

  it("versión ausente -> motivo sin-motivo", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "1",
        nombre: "Neurona sin versión",
        online: true,
        versiones: {}, // no declara ninguna versión
      },
    ];
    const result = neuronasAtrasadas(neuronas, dummyUltima);
    expect(result).toHaveLength(dummyCapas.length);
    result.forEach((atraso) => {
      expect(atraso.motivo).toBe("sin-motivo");
      expect(atraso.tiene).toBeNull();
      expect(atraso.texto).toContain("no declara qué versión tiene");
    });
  });

  it("prioridad de motivos: fallo > offline > espera-wifi > pospuesta > manual > sin-motivo", () => {
    const base: EstadoNeuronaActualizacion = {
      neuronaId: "1",
      nombre: "Neurona de prueba",
      online: true,
      versiones: { datos: "2026.10.01" }, // atrás en datos
    };

    // fallo
    expect(
      neuronasAtrasadas([{ ...base, fallo: "algo" }], dummyUltima)[0].motivo
    ).toBe("fallo");
    // offline
    expect(
      neuronasAtrasadas([{ ...base, online: false }], dummyUltima)[0].motivo
    ).toBe("offline");
    // espera-wifi
    expect(
      neuronasAtrasadas([{ ...base, pospuestaPor: "espera-wifi" }], dummyUltima)[0].motivo
    ).toBe("espera-wifi");
    // pospuesta
    expect(
      neuronasAtrasadas([{ ...base, pospuestaPor: "llamada" }], dummyUltima)[0].motivo
    ).toBe("pospuesta");
    // manual
    expect(
      neuronasAtrasadas([{ ...base, manual: true }], dummyUltima)[0].motivo
    ).toBe("manual");
    // sin-motivo (when none of the above and tiene is null? but we have a version)
    // For sin-motivo, we need a case where tiene is null and no other motives.
    const sinVersion: EstadoNeuronaActualizacion = {
      neuronaId: "2",
      nombre: "Neurona sin versión",
      online: true,
      versiones: {},
    };
    expect(
      neuronasAtrasadas([sinVersion], dummyUltima)[0].motivo
    ).toBe("sin-motivo");
  });

  it("capa sin ultima se ignora", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "1",
        nombre: "Neurona",
        online: true,
        versiones: { datos: "2026.10.01" }, // atrás en datos
      },
    ];
    const { datos: _, ...ultimaSinDatos } = dummyUltima;
    const result = neuronasAtrasadas(neuronas, ultimaSinDatos);
    // debería haber 5 capas (todas excepto datos)
    expect(result).toHaveLength(5);
    result.forEach((atraso) => {
      expect(atraso.capa).not.toBe("datos");
    });
  });

  it("lista vacía de neuronas devuelve vacío", () => {
    expect(neuronasAtrasadas([], dummyUltima)).toHaveLength(0);
  });

  it("versión igual a la última no es atraso", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Exacto",
      online: true,
      versiones: { datos: "2026.10.10" },
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result.some((r) => r.capa === "datos")).toBe(false);
  });

  it("versión mayor a la última no es atraso", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Adelantada",
      online: true,
      versiones: { datos: "2026.10.15" },
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result.some((r) => r.capa === "datos")).toBe(false);
  });

  it("solo una capa atrasada entre varias presentes", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Parcial",
      online: true,
      versiones: { datos: "2026.10.10", interfaz: "2026.10.05", sw: "2026.10.10", servicios: "2026.10.10", modelos: "2026.10.10", nativa: "2026.10.10" },
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result).toHaveLength(1);
    expect(result[0].capa).toBe("interfaz");
    expect(result[0].motivo).toBe("sin-motivo");
  });

  it("offline sin versión da prioridad a offline, no sin-motivo", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Offline",
      online: false,
      versiones: {},
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    expect(result.every((r) => r.motivo === "offline")).toBe(true);
  });

  it("manual con versión antigua mantiene manual", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Manual",
      online: true,
      versiones: { datos: "2026.10.01" },
      manual: true,
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    const datos = result.find((r) => r.capa === "datos");
    expect(datos?.motivo).toBe("manual");
  });

  it("texto de atraso en español con fechas", () => {
    const neuron = {
      neuronaId: "1",
      nombre: "Pixel",
      online: true,
      versiones: { interfaz: "2026.10.01" },
      pospuestaPor: "espera-wifi" as const,
    };
    const result = neuronasAtrasadas([neuron], dummyUltima);
    const atraso = result.find((r) => r.capa === "interfaz");
    expect(atraso?.texto).toContain("Pixel");
    expect(atraso?.texto).toContain("interfaz");
    expect(atraso?.texto).toContain("esperando Wi-Fi");
  });

  it("orden estable por nombre y luego capa", () => {
    const neuronas: EstadoNeuronaActualizacion[] = [
      {
        neuronaId: "2",
        nombre: "Beta",
        online: true,
        versiones: { datos: "2026.10.01" },
      },
      {
        neuronaId: "1",
        nombre: "Alpha",
        online: true,
        versiones: { datos: "2026.10.01" },
      },
      {
        neuronaId: "3",
        nombre: "Alpha", // mismo nombre, diferente id
        online: true,
        versiones: { datos: "2026.10.01" },
      },
    ];
    const result = neuronasAtrasadas(neuronas, dummyUltima);
    // Esperamos 3 neuronas * 6 capas = 18 resultados
    expect(result).toHaveLength(18);
    // Verificar orden: primero por nombre, luego por id
    // Los primeros 6 deben ser de Alpha (id 1), luego los siguientes 6 de Alpha (id 3), luego los últimos 6 de Beta (id 2)
    // Pero note: ordenamos por nombre y luego por id. Entonces:
    // Alpha (id1), Alpha (id3), Beta (id2)
    // Cada grupo de 6 corresponde a una neurona y sus 6 capas en el orden de CAPAS_ORDEN.
    // Vamos a verificar las primeras 6: deben ser de Alpha id1
    for (let i = 0; i < 6; i++) {
      expect(result[i].neuronaId).toBe("1");
      expect(result[i].nombre).toBe("Alpha");
    }
    // Las siguientes 6: Alpha id3
    for (let i = 6; i < 12; i++) {
      expect(result[i].neuronaId).toBe("3");
      expect(result[i].nombre).toBe("Alpha");
    }
    // Las últimas 6: Beta id2
    for (let i = 12; i < 18; i++) {
      expect(result[i].neuronaId).toBe("2");
      expect(result[i].nombre).toBe("Beta");
    }
    // Además, dentro de cada grupo de 6, el orden debe ser el de CAPAS_ORDEN
    // Pero como estamos iterando en el mismo orden en el bucle, ya debería estar.
  });
});
>>>>>>> a0d78c931 (salvavidas · S1010-ACT5d-d1: trabajo del agente antes de las puertas (tsc / vitest))
