// Colibri en el catálogo de capas (architecture/colibri-multicapas.md §2 y §5, CLB1027A).
// Datos de config/capas-colibri-1027.json: la capa «juicio», el runtime «colibri»,
// el formato «safetensors» y el estado «por-verificar» (ningún SHA medido aún).
import { describe, it, expect } from "vitest";
import {
  leerCatalogo,
  candidatosDe,
  usable,
  type EntradaCapa,
} from "../catalogo";

/** Convertido al esquema del catálogo desde config/capas-colibri-1027.json (tarea B). */
const entradaColibri: EntradaCapa = {
  id: "colibri-laya",
  familia: "convaiinnovations",
  capa: "juicio",
  modelo: "Laya (Convai Innovations)",
  version: "v2.0.0",
  formato: "safetensors",
  runtime: "colibri",
  parametros: "1 B",
  disco_mb: 850,
  ram_min_mb: 1700,
  ram_ok_mb: 1700,
  streaming_disco: false,
  sha256: "b".repeat(64),
  fuente_oficial: "https://huggingface.co/convaiinnovations/laya",
  espejos: [],
  estado: "por-verificar",
  medios: ["nativo", "servidor"],
};

describe("protección de la lectura", () => {
  it("la entrada colibri por-verificar se lee", () => {
    const c = leerCatalogo({ esquema: 1, actualizado: "2026-10-27", capas: [entradaColibri] });
    expect(c.capas).toHaveLength(1);
    expect(c.capas[0]?.id).toBe("colibri-laya");
    expect(c.capas[0]?.streaming_disco).toBe(false);
    expect(c.capas[0]?.ram_ok_mb).toBe(1700);
  });

  it("se lee pero no es usable mientras esté por-verificar", () => {
    const c = leerCatalogo({ capas: [entradaColibri] });
    expect(c.capas[0]).toBeTruthy();
    expect(usable(c.capas[0]!)).toBe(false);
    expect(usable({ ...entradaColibri, estado: "recomendado" })).toBe(true);
  });
});

describe("capa juicio", () => {
  it("candidatosDe ordena juicio Laya → GLiNER → Clef y respeta el medio", () => {
    const c = leerCatalogo({
      capas: [
        { ...entradaColibri },
        { ...entradaColibri, id: "colibri-gliner-decide", disco_mb: 1950, ram_ok_mb: 1900 },
        { ...entradaColibri, id: "colibri-clef", disco_mb: 52000, medios: ["servidor"] },
      ],
    });
    expect(candidatosDe(c, "juicio", "servidor").map((e) => e.id)).toEqual([
      "colibri-laya",
      "colibri-gliner-decide",
      "colibri-clef",
    ]);
    expect(candidatosDe(c, "juicio", "nativo").map((e) => e.id)).toEqual([
      "colibri-laya",
      "colibri-gliner-decide",
    ]);
  });

  it("los ids fuera de la tabla de preferencia van al final", () => {
    const c = leerCatalogo({
      capas: [
        { ...entradaColibri },
        { ...entradaColibri, id: "colibri-nuevo-juicio", disco_mb: 900 },
      ],
    });
    expect(candidatosDe(c, "juicio", "servidor").map((e) => e.id)).toEqual([
      "colibri-laya",
      "colibri-nuevo-juicio",
    ]);
  });
});

describe("valores nuevos aceptados y rechazados", () => {
  it("runtime colibri, safetensors y por-verificar son del esquema", () => {
    expect(leerCatalogo({ capas: [entradaColibri] }).capas).toHaveLength(1);
    expect(leerCatalogo({ capas: [{ ...entradaColibri, runtime: "colibri-otro" }] }).capas).toEqual([]);
    expect(leerCatalogo({ capas: [{ ...entradaColibri, formato: "pt" }] }).capas).toEqual([]);
    expect(leerCatalogo({ capas: [{ ...entradaColibri, estado: "por-verificar2" }] }).capas).toEqual([]);
  });

  it("streaming_disco y ram_ok_mb mal formados descartan la entrada", () => {
    expect(leerCatalogo({ capas: [{ ...entradaColibri, streaming_disco: "sí" }] }).capas).toEqual([]);
    expect(leerCatalogo({ capas: [{ ...entradaColibri, ram_ok_mb: true }] }).capas).toEqual([]);
    expect(leerCatalogo({ capas: [{ ...entradaColibri, ram_ok_mb: -1 }] }).capas).toEqual([]);
    expect(
      leerCatalogo({ capas: [{ ...entradaColibri, streaming_disco: true, ram_ok_mb: 32000 }] }).capas,
    ).toHaveLength(1);
  });

  it("ninguna capa sin su SHA ni siquiera entra al catálogo", () => {
    expect(leerCatalogo({ capas: [{ ...entradaColibri, sha256: "" }] }).capas).toEqual([]);
    expect(
      leerCatalogo({ capas: [{ ...entradaColibri, sha256: "por-verificar-pendiente" }] }).capas,
    ).toHaveLength(1);
    expect(usable(leerCatalogo({ capas: [{ ...entradaColibri, sha256: "por-verificar-pendiente" }] }).capas[0]!)).toBe(false);
  });
});
