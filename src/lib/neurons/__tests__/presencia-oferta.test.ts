import { describe, expect, it } from "vitest";
import { mediosDeEstado, presentesPorNeurona, type PresenciaMedio } from "../presencia";
import type { MeshLinkStatus } from "@/ai/astraura/mesh/types";

const baseSenales = {
  internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 10 },
  malla: { pares: 0, otrasCuentas: 0 },
  lora: { estado: "sin-radio" as MeshLinkStatus | "sin-radio", nodos: 0 },
  bluetooth: { disponible: true },
  serie: { disponible: false, puertos: 0 },
  reticulum: { disponible: false as const, motivo: "x" },
};

function baseMedio(overrides: Partial<PresenciaMedio> = {}): PresenciaMedio {
  return {
    n: "neurona-1",
    m: "medio-1",
    tipo: "navegador",
    etiqueta: "Chrome",
    visible: true,
    desde: "2026-01-01T00:00:00.000Z",
    t: Date.now(),
    s: baseSenales,
    ...overrides,
  };
}

describe("presencia: oferta de recursos en el anuncio", () => {
  it("incluye el campo o cuando la neurona anuncia oferta", () => {
    const medioConOferta = baseMedio({
      o: { computo: true, almacenamiento: true, internet: false },
    });
    expect(medioConOferta.o).toEqual({ computo: true, almacenamiento: true, internet: false });
  });

  it("puede no tener campo o (neuronas antiguas o sin anunciar)", () => {
    const medioSinOferta = baseMedio({});
    expect(medioSinOferta.o).toBeUndefined();
  });

  it("mediosDeEstado conserva el campo o del anuncio más nuevo", () => {
    const antiguo = baseMedio({ t: 1000, o: { computo: false, almacenamiento: false, internet: false } });
    const nuevo = baseMedio({ t: 2000, o: { computo: true, almacenamiento: true, internet: true } });
    const medios = mediosDeEstado({ "neurona-1": [antiguo, nuevo] });
    expect(medios).toHaveLength(1);
    expect(medios[0].o).toEqual({ computo: true, almacenamiento: true, internet: true });
  });

  it("presentesPorNeurona agrupa medios con sus ofertas", () => {
    const m1 = baseMedio({ m: "medio-1", o: { computo: true, almacenamiento: false, internet: false } });
    const m2 = baseMedio({ m: "medio-2", o: { computo: false, almacenamiento: true, internet: true } });
    const medios = [m1, m2];
    const porNeurona = presentesPorNeurona(medios);
    expect(porNeurona.get("neurona-1")).toHaveLength(2);
    const ofertas = porNeurona.get("neurona-1")?.map((m) => m.o) ?? [];
    expect(ofertas).toContainEqual({ computo: true, almacenamiento: false, internet: false });
    expect(ofertas).toContainEqual({ computo: false, almacenamiento: true, internet: true });
  });

  it("oferta parcial: solo algunos recursos encendidos", () => {
    const medio = baseMedio({ o: { computo: true, almacenamiento: false, internet: true } });
    expect(medio.o?.computo).toBe(true);
    expect(medio.o?.almacenamiento).toBe(false);
    expect(medio.o?.internet).toBe(true);
  });
});