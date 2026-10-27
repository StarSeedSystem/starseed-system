import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  aPaqueteBiblioteca,
  herramientaPorId,
  respetaReglaDeLicencia,
  usoLicencia,
} from "../catalogo-herramientas";
import { MODELOS_IMAGEN, MOTORES } from "@/lib/imagenes/modelos";

/**
 * Guardia de la tanda 1020d (Ola 1020U · RLB1020R): la URL canónica de ComfyUI
 * es Comfy-Org/ComfyUI y las fichas de Stirling-PDF y LibreTranslate existen con
 * licencia y los avisos del catálogo verificado. Pura: NO lee disco ni red;
 * comprueba los DATOS exportados de los dos archivos implicados.
 */
const RE_URL_VIEJA = /comfyanonymous\/ComfyUI/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_GITHUB = /^https:\/\/github\.com\//;

describe("1020U · URL canónica de ComfyUI", () => {
  it("el motor comfyui de la tabla de modelos apunta a la canónica", () => {
    expect(MOTORES.comfyui.fuente).toBe("https://github.com/Comfy-Org/ComfyUI");
  });

  it("la ficha ComfyUI apunta a la canónica y conserva su versión registrada", () => {
    const h = herramientaPorId("comfyui");
    expect(h).toBeDefined();
    if (!h) return;
    expect(h.codigo).toBe("https://github.com/Comfy-Org/ComfyUI");
    expect(h.actualizacion.ref).toBe("Comfy-Org/ComfyUI");
    expect(h.actualizacion.ultimaVersion).toBe("v0.39.2");
    expect(h.actualizacion.fechaVersion).toBe("2026-10-07");
  });

  it("ComfyUI sigue GPL y como servicio aparte, nunca enlazado", () => {
    const h = herramientaPorId("comfyui");
    expect(h?.licencia).toBe("GPL-3.0");
    expect(respetaReglaDeLicencia(h as NonNullable<typeof h>)).toBe(true);
  });

  it("no queda ninguna referencia a comfyanonymous/ComfyUI en los datos de los dos archivos", () => {
    const textos = JSON.stringify(MOTORES) + JSON.stringify(MODELOS_IMAGEN) + JSON.stringify(CATALOGO_PROTOMOLECULA);
    expect(textos, "src/lib/imagenes/modelos.ts y src/lib/protomolecula/catalogo-herramientas.ts").not.toMatch(RE_URL_VIEJA);
  });
});

describe("1020U · fichas de Stirling-PDF y LibreTranslate", () => {
  const IDS_1020R = ["stirling-pdf", "libretranslate"] as const;

  it.each(IDS_1020R)("%s: una sola ficha, con licencia, versión y formato del catálogo", (id) => {
    const fichas = CATALOGO_PROTOMOLECULA.filter((h) => h.id === id);
    expect(fichas, id).toHaveLength(1);
    const h = fichas[0];
    expect(h.licencia.trim().length, id).toBeGreaterThan(0);
    expect(usoLicencia(h), `${id}: ${h.licencia}`).not.toBe("sin-permiso");
    expect(respetaReglaDeLicencia(h), id).toBe(true);
    expect(h.codigo, id).toMatch(RE_GITHUB);
    expect(h.verificado, id).toMatch(RE_FECHA);
    expect(h.estado, id).toBe("integrable");
    expect(h.integracion, id).toBe("servicio-local");
    expect(h.motivo, id).toMatch(/bolsa/i);
    expect(h.motivo, id).toMatch(/no se promete que corra en el aparato/);
    expect(h.avisos, id).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(h.actualizacion.ultimaVersion, id).toBeTruthy();
    expect(h.actualizacion.fechaVersion, id).toMatch(RE_FECHA);
    expect(aPaqueteBiblioteca(h).comingSoon, id).toBe(false);
  });

  it("Stirling-PDF: MIT con su aviso, canal releases y edición de PDF", () => {
    const h = herramientaPorId("stirling-pdf");
    expect(h).toBeDefined();
    if (!h) return;
    expect(h.licencia).toBe("MIT");
    expect(h.categoria).toBe("documentos-pdf");
    expect(h.descripcion).toMatch(/unir, dividir/i);
    expect(h.formatos.entrada).toContain("pdf");
    expect(h.formatos.salida).toContain("pdf");
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: "Stirling-Tools/Stirling-PDF", ultimaVersion: "v3.2.0", fechaVersion: "2026-10-15" });
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/solo la parte MIT/i);
    expect(avisos).toMatch(/app\/proprietary/);
    expect(avisos).toMatch(/PDF privado/i);
  });

  it("LibreTranslate: AGPL como servicio aparte y traduce textos y subtítulos", () => {
    const h = herramientaPorId("libretranslate");
    expect(h).toBeDefined();
    if (!h) return;
    expect(h.licencia).toBe("AGPL-3.0");
    expect(h.descripcion).toMatch(/traduce textos y subtítulos/i);
    expect(h.formatos.entrada).toEqual(expect.arrayContaining(["srt", "vtt"]));
    expect(h.ia).toContain("traduce-subtitulos");
    expect(h.actualizacion).toMatchObject({ fuente: "github-tags", ref: "LibreTranslate/LibreTranslate", ultimaVersion: "1.9.6" });
    const avisos = (h.avisos ?? []).join(" ");
    expect(avisos).toMatch(/AGPL-3\.0: se usa tal cual/i);
    expect(avisos).toMatch(/libretranslate\.com es de pago con clave/i);
    expect(avisos).toMatch(/solo se traduce en el aparato/i);
  });
});
