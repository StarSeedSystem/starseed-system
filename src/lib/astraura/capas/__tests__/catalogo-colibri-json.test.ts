import { describe, it, expect } from "vitest";
import { leerCatalogo, usable } from "../catalogo";
import catalogoCrudo from "../../../../../config/capas-astraura.json";

// Las 9 capas de Colibri entraron desde config/capas-colibri-1027.json (CLB1027B):
// todas «por-verificar», ninguna usable hasta que el instalador mida su SHA-256.
const IDS_COLIBRI = [
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

describe("catálogo JSON con las 9 capas de Colibri", () => {
  const catalogo = leerCatalogo(catalogoCrudo);
  const colibri = catalogo.capas.filter((e) => e.id.startsWith("colibri-"));

  it("leerCatalogo lee las 9 y todas pasan el esquema de EntradaCapa", () => {
    expect(colibri).toHaveLength(9);
    expect(colibri.map((e) => e.id)).toEqual(IDS_COLIBRI);
    // 23: las 22 de siempre más la incrustación de LEANN (LNN1028H); las 2 «oído» quedan fuera del esquema.
    expect(catalogo.capas).toHaveLength(23);
  });

  it("ninguna capa de Colibri es usable todavía", () => {
    for (const entrada of colibri) {
      expect(entrada.estado).toBe("por-verificar");
      expect(entrada.sha256).toBe("por-verificar");
      expect(usable(entrada)).toBe(false);
    }
  });

  it("todas son runtime colibri y formato safetensors con versión v2.0.0", () => {
    for (const entrada of colibri) {
      expect(entrada.runtime).toBe("colibri");
      expect(entrada.formato).toBe("safetensors");
      expect(entrada.version).toBe("colibri v2.0.0");
    }
  });

  it("las MoE profundas llevan streaming_disco y todas tienen ram_ok_mb", () => {
    const conStreaming = colibri.filter((e) => e.streaming_disco);
    expect(conStreaming.map((e) => e.id).sort()).toEqual([
      "colibri-deepseek-v4-flash-reap",
      "colibri-glm-5.2",
      "colibri-qwen38-flash-next",
    ]);
    expect(colibri.every((e) => typeof e.ram_ok_mb === "number")).toBe(true);
  });
});
