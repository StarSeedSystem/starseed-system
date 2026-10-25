import { describe, expect, it } from "vitest";
import { CATALOGO_PROTOMOLECULA, herramientaPorId } from "../catalogo-herramientas";
import { MOTORES } from "@/lib/imagenes/modelos";

/** URL canónica del motor de imagen (Ola 1020U): nada que apunte al repo viejo. */
describe("URL canónica de ComfyUI (RLB1020R)", () => {
  it("la ficha de la Protomolécula apunta a Comfy-Org/ComfyUI en código y canal de versiones", () => {
    const h = herramientaPorId("comfyui");
    expect(h?.codigo).toBe("https://github.com/Comfy-Org/ComfyUI");
    expect(h?.actualizacion.ref).toBe("Comfy-Org/ComfyUI");
  });

  it("la versión queda intacta: v0.39.2 del 2026-10-07", () => {
    const h = herramientaPorId("comfyui");
    expect(h?.actualizacion).toMatchObject({ fuente: "github-releases", ultimaVersion: "v0.39.2", fechaVersion: "2026-10-07" });
  });

  it("la ficha del motor de imágenes usa la misma URL canónica", () => {
    expect(MOTORES.comfyui.fuente).toBe("https://github.com/Comfy-Org/ComfyUI");
  });

  it("ningún dato de los dos catálogos menciona el repositorio viejo", () => {
    expect(JSON.stringify(CATALOGO_PROTOMOLECULA)).not.toMatch(/comfyanonymous/i);
    expect(JSON.stringify(MOTORES)).not.toMatch(/comfyanonymous/i);
  });
});

/** Las dos fichas nuevas de la 4.ª tanda, con el mismo formato que las demás. */
describe("fichas nuevas de la Protomolécula (RLB1020R)", () => {
  it("Stirling-PDF está en el catálogo, exactamente una vez", () => {
    expect(CATALOGO_PROTOMOLECULA.filter((h) => h.id === "stirling-pdf")).toHaveLength(1);
  });

  it("Stirling-PDF: MIT, editor de PDF como servicio que coloca la bolsa", () => {
    const h = herramientaPorId("stirling-pdf");
    expect(h?.licencia).toBe("MIT");
    expect(h?.codigo).toBe("https://github.com/Stirling-Tools/Stirling-PDF");
    expect(h?.actualizacion).toMatchObject({ fuente: "github-releases", ref: "Stirling-Tools/Stirling-PDF", ultimaVersion: "3.2.0" });
    expect(h?.categoria).toBe("documentos-pdf");
    expect(h?.integracion).toBe("servicio-local");
    expect(h?.estado).toBe("integrable");
    expect(h?.motivo).toMatch(/bolsa de recursos/i);
    expect(h?.motivo).toMatch(/No se promete que corra en el propio aparato/);
    expect((h?.avisos ?? []).join(" ")).toMatch(/carpetas con licencia propia/);
    expect((h?.avisos ?? []).join(" ")).toMatch(/1,4 GiB/);
  });

  it("LibreTranslate está en el catálogo, exactamente una vez", () => {
    expect(CATALOGO_PROTOMOLECULA.filter((h) => h.id === "libretranslate")).toHaveLength(1);
  });

  it("LibreTranslate: AGPL-3.0, traducción como servicio que coloca la bolsa", () => {
    const h = herramientaPorId("libretranslate");
    expect(h?.licencia).toBe("AGPL-3.0");
    expect(h?.codigo).toBe("https://github.com/LibreTranslate/LibreTranslate");
    expect(h?.actualizacion).toMatchObject({ fuente: "github-tags", ref: "LibreTranslate/LibreTranslate", ultimaVersion: "1.9.6" });
    expect(h?.integracion).toBe("servicio-local");
    expect(h?.estado).toBe("integrable");
    expect(h?.motivo).toMatch(/bolsa de recursos/i);
    expect((h?.avisos ?? []).join(" ")).toMatch(/libretranslate\.com/);
    expect((h?.avisos ?? []).join(" ")).toMatch(/nunca en un servidor ajeno/);
    expect(h?.formatos.entrada).toContain("srt");
    expect(h?.control.notas).toMatch(/subtítulos/i);
  });
});
