import { describe, expect, it } from "vitest";
import { neuronasAtrasadas, type EstadoNeuronaActualizacion, type MotivoAtraso } from "../atrasadas";

describe("neuronas atrasadas y por qué", () => {
  const ultima = { interfaz: "2026.10.10", nativa: "0.3.0" };

  it("al día no aparece; atrasada dice qué tiene, qué debería y por qué", () => {
    const r = neuronasAtrasadas(
      [
        { neuronaId: "m", nombre: "Mac", online: true, versiones: { interfaz: "2026.10.10", nativa: "0.3.0" } },
        { neuronaId: "t", nombre: "Tablet", online: true, versiones: { interfaz: "2026.10.01" }, pospuestaPor: "espera-wifi" },
      ],
      ultima,
    );
    expect(r.map((a) => [a.nombre, a.capa, a.motivo])).toEqual([
      ["Tablet", "interfaz", "espera-wifi"],
      ["Tablet", "nativa", "espera-wifi"],
    ]);
    expect(r[0].texto).toBe("Tablet va atrasada en interfaz (2026.10.01 → 2026.10.10): esperando Wi-Fi.");
  });

  it("prioridad de motivos: fallo > fuera de línea > Wi-Fi > pospuesta > manual > sin motivo", () => {
    const base = { neuronaId: "x", nombre: "X", online: true, versiones: {} };
    const motivo = (o: object) => neuronasAtrasadas([{ ...base, ...o }], { interfaz: "2" })[0].motivo;
    expect(motivo({ fallo: "humo", online: false })).toBe("fallo");
    expect(motivo({ online: false, pospuestaPor: "llamada" })).toBe("offline");
    expect(motivo({ pospuestaPor: "llamada", manual: true })).toBe("pospuesta");
    expect(motivo({ manual: true })).toBe("manual");
    expect(motivo({})).toBe("sin-motivo");
    expect(motivo({ versiones: { interfaz: "1" } })).toBe("sin-motivo");
  });

  it("orden por nombre y capas sin versión de referencia se ignoran", () => {
    const r = neuronasAtrasadas(
      [
        { neuronaId: "2", nombre: "Zeta", online: true, versiones: {} },
        { neuronaId: "1", nombre: "Alfa", online: true, versiones: {} },
      ],
      { sw: "v9" },
    );
    expect(r.map((a) => a.nombre)).toEqual(["Alfa", "Zeta"]);
    expect(r.every((a) => a.capa === "sw")).toBe(true);
  });
});