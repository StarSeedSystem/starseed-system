import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOTORES } from "@/lib/imagenes/modelos";
import {
  CATALOGO_PROTOMOLECULA,
  herramientaPorId,
  respetaReglaDeLicencia,
  usoLicencia,
} from "../catalogo-herramientas";

/** Ola 1020R: URL canónica de ComfyUI y fichas de Stirling-PDF y LibreTranslate. */
const IDS_1020R = ["stirling-pdf", "libretranslate"] as const;

const leerFuente = (rutas: Array<{ dir: string; archivo: string }>) =>
  rutas.map((r) => ({ ruta: `${r.dir}/${r.archivo}`, texto: readFileSync(path.join(__dirname, r.dir, r.archivo), "utf8") }));

describe("Ola 1020R · ComfyUI en su URL canónica", () => {
  it("ninguna referencia a comfyanonymous/ComfyUI en modelos.ts ni en el catálogo", () => {
    const fuentes = leerFuente([
      { dir: "../../imagenes", archivo: "modelos.ts" },
      { dir: "..", archivo: "catalogo-herramientas.ts" },
    ]);
    for (const f of fuentes) {
      expect(f.texto.includes("comfyanonymous/ComfyUI"), f.ruta).toBe(false);
    }
  });

  it("la ficha de ComfyUI apunta a Comfy-Org/ComfyUI sin tocar su versión", () => {
    const h = herramientaPorId("comfyui");
    expect(h).toBeDefined();
    expect(h?.codigo).toBe("https://github.com/Comfy-Org/ComfyUI");
    expect(h?.actualizacion.ref).toBe("Comfy-Org/ComfyUI");
    expect(h?.actualizacion.ultimaVersion).toBe("v0.39.2");
    expect(h?.actualizacion.fechaVersion).toBe("2026-10-07");
    expect(h?.licencia).toBe("GPL-3.0");
  });

  it("el motor comfyui de las imágenes también apunta a la canónica", () => {
    const motores = MOTORES as Record<string, { fuente: string }>;
    expect(motores.comfyui.fuente).toBe("https://github.com/Comfy-Org/ComfyUI");
  });

  it("las dos fichas nuevas existen una sola vez", () => {
    for (const id of IDS_1020R) {
      const fichas = CATALOGO_PROTOMOLECULA.filter((h) => h.id === id);
      expect(fichas, id).toHaveLength(1);
    }
  });
});

describe("Ola 1020R · Stirling-PDF y LibreTranslate en la Protomolécula", () => {
  it.each(IDS_1020R)("%s trae licencia, motivo, fecha de verificación y la regla de licencia de la casa", (id) => {
    const h = herramientaPorId(id);
    expect(h, id).toBeDefined();
    if (!h) return;
    expect(h.licencia.trim().length, id).toBeGreaterThan(0);
    expect(h.verificado).toBe("2026-10-20");
    expect(h.motivo.length, id).toBeGreaterThan(10);
    expect(usoLicencia(h), id).not.toBe("sin-permiso");
    expect(respetaReglaDeLicencia(h), id).toBe(true);
  });

  it("las dos son servicios que coloca la bolsa (no se promete que corran en el aparato)", () => {
    for (const id of IDS_1020R) {
      const h = herramientaPorId(id)!;
      expect(h.estado).toBe("integrable");
      expect(h.integracion).toBe("servicio-local");
      expect(h.motivo).toMatch(/bolsa de recursos/);
      expect(h.motivo).toMatch(/nunca se promete en el propio aparato/);
      expect((h.avisos ?? []).join(" ").length).toBeGreaterThan(0);
    }
  });

  it("Stirling-PDF es MIT y dice qué partes quedan fuera", () => {
    const h = herramientaPorId("stirling-pdf")!;
    expect(h.categoria).toBe("documentos-pdf");
    expect(h.licencia).toBe("MIT");
    expect(h.codigo).toBe("https://github.com/Stirling-Tools/Stirling-PDF");
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: "Stirling-Tools/Stirling-PDF", ultimaVersion: "3.2.0" });
    expect((h.avisos ?? []).join(" ")).toMatch(/Open-core|licencia propia/i);
  });

  it("LibreTranslate es AGPL-3.0, no enlazada, y traduce textos y subtítulos", () => {
    const h = herramientaPorId("libretranslate")!;
    expect(h.categoria).toBe("ia-generativa");
    expect(h.licencia).toBe("AGPL-3.0");
    expect(h.codigo).toBe("https://github.com/LibreTranslate/LibreTranslate");
    expect(h.actualizacion).toMatchObject({ fuente: "github-tags", ref: "LibreTranslate/LibreTranslate", ultimaVersion: "1.9.6" });
    expect(["libreria-js", "wasm-en-worker"], "AGPL no se enlaza").not.toContain(h.integracion);
    expect(h.ia).toContain("traduce-texto");
    expect(h.ia).toContain("traduce-subtitulos");
    expect((h.avisos ?? []).join(" ")).toMatch(/AGPL/);
  });
});

