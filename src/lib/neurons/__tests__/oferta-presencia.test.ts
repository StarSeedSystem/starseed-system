import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/neurons/neurons", () => ({
  thisDeviceId: () => "neurona-test",
  settingsFor: (id: string) => ({
    offerPublicInternet: id === "neurona-test",
  }),
  permissionsFor: (id: string) => ({
    compute: id === "neurona-test",
    storage: id === "neurona-test",
    sync: true,
    agent: true,
    senses: true,
    wake: true,
  }),
}));

import { type PresenciaMedio } from "../presencia";
import { mediosDeEstado } from "../presencia";

describe("oferta en presencia", () => {
  const baseOferta = { compute: true, storage: true, internet: true };
  const baseNoOferta = { compute: false, storage: false, internet: false };

  function medioConOferta(n: string, m: string, t: number, oferta = baseOferta): PresenciaMedio {
    return {
      n,
      m,
      t,
      tipo: "navegador",
      etiqueta: m,
      visible: true,
      desde: "x",
      s: {
        internet: { enLinea: true },
        malla: { pares: 0, otrasCuentas: 0 },
        lora: { estado: "sin-radio", nodos: 0 },
        bluetooth: { disponible: null },
        serie: { disponible: false, puertos: 0 },
        reticulum: { disponible: false, motivo: "x" },
      },
      o: oferta,
    };
  }

  it("un medio con oferta la anuncia en su presencia", () => {
    const m = medioConOferta("neurona-1", "medio-1", 1000);
    expect(m.o).toEqual(baseOferta);
  });

  it("un medio sin oferta anuncia false en los tres campos", () => {
    const m = medioConOferta("neurona-2", "medio-2", 2000, baseNoOferta);
    expect(m.o).toEqual(baseNoOferta);
  });

  it("mediosDeEstado conserva la oferta del anuncio más nuevo", () => {
    const estado = {
      m1: [
        medioConOferta("neurona-1", "m1", 1, baseNoOferta),
        medioConOferta("neurona-1", "m1", 5, baseOferta),
      ],
      m2: [medioConOferta("neurona-2", "m2", 3, baseNoOferta)],
    };
    const medios = mediosDeEstado(estado);
    const m1 = medios.find((x) => x.m === "m1");
    const m2 = medios.find((x) => x.m === "m2");
    expect(m1?.o).toEqual(baseOferta);
    expect(m2?.o).toEqual(baseNoOferta);
  });
});