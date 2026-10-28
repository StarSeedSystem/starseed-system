import { describe, it, expect } from "vitest";
import catalogoJson from "../../../../../config/capas-astraura.json";
import { leerCatalogo, usable } from "../catalogo";

// Las 9 entradas de Colibri de config/capas-colibri-1027.json, ya en el catálogo
// de capas (tarea CLB1027B): todas «por-verificar», ninguna usable todavía (§6).
const ES_UNA_DE = [
  "colibri-laya",
  "colibri-gliner-decide",
  "colibri-clef",
  "colibri-olmoe-7b",
  "colibri-qwen3-coder-30b",
  "colibri-qwen36-35b",
  "colibri-deepseek-v4-flash-reap",
  "colibri-qwen38-flash-next",
  "colibri-glm-5.2",
];

describe("entradas de Colibri en config/capas-astraura.json", () => {
  const catalogo = leerCatalogo(catalogoJson);
  const deColibri = catalogo.capas.filter((c) => ES_UNA_DE.includes(c.id));

  it("leerCatalogo lee las 9 entradas del catálogo real", () => {
    expect(ES_UNA_DE).toHaveLength(9);
    expect(deColibri).toHaveLength(9);
    expect(new Set(deColibri.map((c) => c.id)).size).toBe(9);
  });

  it("todas son runtime colibri, formato safetensors y estado por-verificar", () => {
    for (const c of deColibri) {
      expect(c.runtime).toBe("colibri");
      expect(c.formato).toBe("safetensors");
      expect(c.version).toBe("colibri v2.0.0");
      expect(c.estado).toBe("por-verificar");
      expect(c.sha256).toBe("por-verificar");
    }
  });

  it("ninguna es usable todavía: falta el SHA-256 medido (§6)", () => {
    expect(deColibri.some(usable)).toBe(false);
  });

  it("medios, streaming y disposiciones por entrada", () => {
    const porId = new Map(deColibri.map((c) => [c.id, c]));
    expect(porId.get("colibri-laya")?.medios).toEqual(["nativo", "servidor"]);
    expect(porId.get("colibri-clef")?.medios).toEqual(["servidor"]);
    expect(porId.get("colibri-laya")?.disco_mb).toBe(870);
    expect(porId.get("colibri-laya")?.ram_min_mb).toBe(1741);
    expect(porId.get("colibri-deepseek-v4-flash-reap")?.streaming_disco).toBe(true);
    expect(porId.get("colibri-qwen38-flash-next")?.ram_ok_mb).toBe(32768);
    expect(porId.get("colibri-glm-5.2")?.disco_mb).toBe(439603);
    expect(porId.get("colibri-olmoe-7b")?.familia).toBe("JustVugg/colibri");
  });

  it("ninguna capa Colibri sirve hoy a ningún medio (planificador sin candidatos nuevos)", () => {
    expect(deColibri.every((c) => c.estado === "por-verificar")).toBe(true);
    expect(catalogo.esquema).toBe(1);
    expect(catalogo.actualizado).toBe("2026-10-27");
  });
});
