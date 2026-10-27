import { describe, it, expect } from "vitest";
import { candidatosDe, leerCatalogo, usable, type EntradaCapa } from "../catalogo";

const colibriLaya: EntradaCapa = {
  id: "colibri-laya",
  familia: "colibri/laya",
  capa: "juicio",
  modelo: "Laya (Convai Innovations)",
  version: "2.0.0",
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

describe("catálogo de Colibri", () => {
  it("acepta la capa juicio, el runtime colibri y el formato safetensors", () => {
    const c = leerCatalogo({ esquema: 1, actualizado: "2026-10-27", capas: [colibriLaya] });
    expect(c.capas).toHaveLength(1);
    expect(c.capas[0]).toMatchObject({
      id: "colibri-laya",
      capa: "juicio",
      runtime: "colibri",
      formato: "safetensors",
      estado: "por-verificar",
    });
  });

  it("lee una entrada colibri por-verificar pero no la da por usable", () => {
    const [leida] = leerCatalogo({ capas: [colibriLaya] }).capas;
    expect(leida).toBeDefined();
    expect(usable(leida)).toBe(false);
  });

  it("una entrada de juicio con SHA verificado sí es usable y candidata en servidor", () => {
    const verificada: EntradaCapa = {
      ...colibriLaya,
      sha256: "b".repeat(64),
      estado: "recomendado",
    };
    const c = leerCatalogo({ capas: [verificada] });
    expect(usable(c.capas[0])).toBe(true);
    expect(candidatosDe(c, "juicio", "servidor").map((e) => e.id)).toEqual(["colibri-laya"]);
  });

  it("conserva streaming_disco y ram_ok_mb, y descarta los mal tipados", () => {
    const c = leerCatalogo({
      capas: [
        { ...colibriLaya, id: "colibri-glm-5.2", streaming_disco: true, ram_ok_mb: 24576 },
        { ...colibriLaya, id: "ram-mala", ram_ok_mb: "mucha" },
        { ...colibriLaya, id: "streaming-malo", streaming_disco: "sí" },
      ],
    });
    expect(c.capas.map((e) => e.id)).toEqual(["colibri-glm-5.2"]);
    expect(c.capas[0].streaming_disco).toBe(true);
    expect(c.capas[0].ram_ok_mb).toBe(24576);
  });
});
