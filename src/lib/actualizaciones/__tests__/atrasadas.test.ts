import { describe, it, expect } from "vitest";
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
    const ultimaSinDatos = { ...dummyUltima };
    delete ultimaSinDatos.datos; // ahora datos no está en ultima
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