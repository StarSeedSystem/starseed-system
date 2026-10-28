import { describe, it, expect } from "vitest";
import { candidatosDe, leerCatalogo, usable, type EntradaCapa } from "../catalogo";

const SHA = "b".repeat(64);

// Datos de config/capas-colibri-1027.json: sin SHA medido todavía, todo «por-verificar».
const laya: EntradaCapa = {
  id: "colibri-laya",
  familia: "convaiinnovations/laya",
  capa: "juicio",
  modelo: "Laya",
  version: "v2.0.0",
  formato: "safetensors",
  runtime: "colibri",
  parametros: "0,85 GB",
  disco_mb: 870,
  ram_min_mb: 1740,
  ram_ok_mb: 1740,
  sha256: "por-verificar",
  fuente_oficial: "https://huggingface.co/convaiinnovations/laya",
  espejos: [],
  estado: "por-verificar",
  medios: ["nativo", "servidor"],
};

describe("catálogo con Colibri", () => {
  it("acepta la capa juicio, el runtime colibri y el formato safetensors", () => {
    const c = leerCatalogo({ esquema: 1, actualizado: "2026-10-27", capas: [laya] });
    expect(c.capas).toHaveLength(1);
    expect(c.capas[0].capa).toBe("juicio");
    expect(c.capas[0].runtime).toBe("colibri");
    expect(c.capas[0].formato).toBe("safetensors");
    expect(c.capas[0].estado).toBe("por-verificar");
  });

  it("una entrada colibri por-verificar se lee pero no es usable", () => {
    const leida = leerCatalogo({ capas: [laya] }).capas[0];
    expect(leida).toBeDefined();
    expect(usable(leida)).toBe(false);
  });

  it("el estado manda: con SHA real pero por-verificar sigue sin usarse", () => {
    expect(usable({ ...laya, sha256: SHA })).toBe(false);
    expect(usable({ ...laya, sha256: SHA, estado: "recomendado" })).toBe(true);
    expect(usable({ ...laya, sha256: SHA, estado: "respaldo" })).toBe(true);
  });

  it("acepta streaming_disco y ram_ok_mb y descarta los mal tipados", () => {
    const grande = { ...laya, id: "colibri-glm-5.2", capa: "profunda" as const, streaming_disco: true };
    expect(leerCatalogo({ capas: [grande] }).capas).toHaveLength(1);
    expect(leerCatalogo({ capas: [{ ...laya, ram_ok_mb: -1 }] }).capas).toEqual([]);
    expect(leerCatalogo({ capas: [{ ...laya, streaming_disco: "sí" }] }).capas).toEqual([]);
  });

  it("ordena los candidatos de juicio de Laya a Clef", () => {
    const c = leerCatalogo({
      capas: [
        { ...laya, id: "colibri-clef", disco_mb: 53_250 },
        { ...laya, id: "colibri-gliner-decide", disco_mb: 2000 },
        laya,
      ],
    });
    expect(candidatosDe(c, "juicio", "servidor").map((e) => e.id)).toEqual([
      "colibri-laya",
      "colibri-gliner-decide",
      "colibri-clef",
    ]);
    expect(candidatosDe(c, "juicio", "web")).toEqual([]);
  });
});
