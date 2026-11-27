import { describe, expect, it } from "vitest";
import { revisarIdentidadCompartida, VENTANA_APARATO_VIVO_MS, claveRevisionVista, claveRevisionPospuesto } from "../revision-identidad";

const ahora = 1_750_000_000_000;

// Los ids de aparato deben tener 6 o más caracteres (`leerMapaAparatos` descarta los cortos).
function capabilities(aparatos: Record<string, { n?: string; equipo?: string; so?: string; ts: number; fuera?: number; huella?: string }>) {
  return { aparatos };
}

const base = (cap: unknown, yoId: string) => ({
  idNeurona: "e0b9faf2",
  nombreNeurona: "e0b9faf2",
  capabilities: cap,
  yoId,
  ahora,
});

describe("revisarIdentidadCompartida", () => {
  it("dos aparatos de la misma neurona con huella distinta: cada uno ve la ventana", () => {
    const cap = capabilities({
      apar_a: { n: "Maggaboard", equipo: "SM-X205", so: "android", ts: ahora - 200_000 },
      apar_b: { n: "Maggadroid", equipo: "SM-X710", so: "android", ts: ahora - 100_000 },
    });
    const rTabla = revisarIdentidadCompartida(base(cap, "apar_a"));
    expect(rTabla).not.toBeNull();
    expect(rTabla!.yoSeUnioDespues).toBe(false); // la primera conserva la neurona
    expect(rTabla!.nombrePropuesto).toBe("Maggaboard");
    expect(rTabla!.otros.map((o) => o.nombre)).toEqual(["Maggadroid"]);
    expect(rTabla!.otrosNombres).toEqual(["Maggadroid"]);

    const rMovil = revisarIdentidadCompartida(base(cap, "apar_b"));
    expect(rMovil).not.toBeNull();
    expect(rMovil!.yoSeUnioDespues).toBe(true); // se unió después: le toca crear la suya
    expect(rMovil!.nombrePropuesto).toBe("Maggadroid");
    expect(rMovil!.otros.map((o) => o.nombre)).toEqual(["Maggaboard"]);
  });

  it("un solo aparato: no hay ventana", () => {
    const r = revisarIdentidadCompartida(base(capabilities({ apar_a: { n: "A", equipo: "E1", so: "android", ts: ahora } }), "apar_a"));
    expect(r).toBeNull();
  });

  it("dos medios del mismo aparato (mismo equipo y sistema): no hay ventana", () => {
    const r = revisarIdentidadCompartida(base(capabilities({
      apar_a: { n: "A", equipo: "Mismo", so: "android", ts: ahora - 100_000 },
      apar_b: { n: "A", equipo: "Mismo", so: "android", ts: ahora - 50_000 },
    }), "apar_a"));
    expect(r).toBeNull();
  });

  it("sin señal que distinga los aparatos: no hay ventana", () => {
    const r = revisarIdentidadCompartida(base(capabilities({
      apar_a: { n: "A", ts: ahora - 100_000 },
      apar_b: { n: "B", ts: ahora - 50_000 },
    }), "apar_a"));
    expect(r).toBeNull();
  });

  it("yo no está entre los aparatos vivos: no hay ventana", () => {
    const r = revisarIdentidadCompartida(base(capabilities({
      apar_a: { n: "A", equipo: "E1", so: "android", ts: ahora },
      apar_b: { n: "B", equipo: "E2", so: "android", ts: ahora },
    }), "apar_z"));
    expect(r).toBeNull();
  });

  it("tres aparatos: dos comparten señal y uno es distinto", () => {
    const cap = capabilities({
      apar_a: { n: "Maggaboard", equipo: "SM-X205", so: "android", ts: ahora - 300_000 },
      apar_b: { n: "Otro medio de la tableta", equipo: "SM-X205", so: "android", ts: ahora - 200_000 },
      apar_c: { n: "Maggadroid", equipo: "SM-X710", so: "android", ts: ahora - 100_000 },
    });
    const rC = revisarIdentidadCompartida(base(cap, "apar_c"));
    expect(rC!.yoSeUnioDespues).toBe(true);
    expect(rC!.otros.map((o) => o.nombre).sort()).toEqual(["Maggaboard", "Otro medio de la tableta"]);

    const rA = revisarIdentidadCompartida(base(cap, "apar_a"));
    expect(rA!.yoSeUnioDespues).toBe(false);
    expect(rA!.otros.map((o) => o.nombre)).toEqual(["Maggadroid"]);
  });

  it("entrada con lápida no cuenta como vivo", () => {
    const r = revisarIdentidadCompartida(base(capabilities({
      apar_a: { n: "A", equipo: "E1", so: "android", ts: ahora - 100_000, fuera: ahora },
      apar_b: { n: "B", equipo: "E2", so: "android", ts: ahora - 50_000 },
    }), "apar_b"));
    expect(r).toBeNull();
  });

  it("entrada más vieja que la ventana de presencia no cuenta como vivo", () => {
    const r = revisarIdentidadCompartida(base(capabilities({
      apar_a: { n: "A", equipo: "E1", so: "android", ts: ahora - VENTANA_APARATO_VIVO_MS - 1 },
      apar_b: { n: "B", equipo: "E2", so: "android", ts: ahora },
    }), "apar_b"));
    expect(r).toBeNull();
  });

  it("nombre propuesto es el del aparato y la primera conserva la neurona", () => {
    const cap = capabilities({
      apar_primera: { n: "Primera", equipo: "E1", so: "android", ts: ahora - 500_000 },
      apar_segunda: { n: "Segunda", equipo: "E2", so: "android", ts: ahora - 100_000 },
    });
    const r = revisarIdentidadCompartida({ ...base(cap, "apar_segunda"), nombreNeurona: "Neurona compartida" });
    expect(r!.nombrePropuesto).toBe("Segunda");
    expect(r!.yoSeUnioDespues).toBe(true);
    expect(r!.otros[0].nombre).toBe("Primera");
  });

  it("claves de almacenamiento son estables por versión y neurona", () => {
    expect(claveRevisionVista("0.5.1", "e0b9faf2")).toBe("starseed.neuron.revision-identidad.vista.0.5.1.e0b9faf2");
    expect(claveRevisionPospuesto(null, "e0b9faf2")).toBe("starseed.neuron.revision-identidad.pospuesto.desconocida.e0b9faf2");
    expect(claveRevisionVista("0.5.1", "e0b9faf2")).not.toBe(claveRevisionVista("0.5.2", "e0b9faf2"));
  });
});
