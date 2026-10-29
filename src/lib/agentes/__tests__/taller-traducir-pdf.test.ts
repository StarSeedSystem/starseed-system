import { describe, expect, it } from "vitest";
import {
  catalogoDeclarado,
  disponibleEn,
  filtrarRecursos,
  RECURSOS_TRADUCCION_PDF,
  type RecursoAgente,
} from "../taller";

function porId(id: string): RecursoAgente | undefined {
  return catalogoDeclarado().find((r) => r.id === id);
}

describe("Taller · herramientas traducir y editar_pdf (TRD1020F)", () => {
  it("los ids del catálogo son únicos", () => {
    const ids = catalogoDeclarado().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los dos recursos existen como herramienta en cualquier máquina", () => {
    const traducir = porId("os:traducir");
    const pdf = porId("astraura:editar-pdf");
    expect(traducir).toBeDefined();
    expect(pdf).toBeDefined();
    expect(traducir?.origen).toBe("os");
    expect(pdf?.origen).toBe("astraura");
    for (const r of [traducir, pdf]) {
      expect(r?.tipo).toBe("herramienta");
      expect(r?.maquina).toBe("cualquiera");
      if (!r) throw new Error("recurso ausente del catálogo");
      expect(disponibleEn(r, "mac")).toBe(true);
      expect(disponibleEn(r, "nube")).toBe(true);
    }
  });

  it("declaran su privacidad y traducir no saca lo privado", () => {
    const traducir = porId("os:traducir");
    const pdf = porId("astraura:editar-pdf");
    for (const r of [traducir, pdf]) {
      expect(r?.privacidad).toBeTruthy();
      expect((r?.privacidad ?? "").toLowerCase()).toContain("privado");
    }
    for (const donde of ["aparato", "cuenta", "cerebro"]) {
      expect(traducir?.privacidad).toContain(donde);
    }
    expect(traducir?.descripcion).toContain("por capas");
    expect(traducir?.ruta).toBe("src/lib/traduccion/motor.ts");
    expect(pdf?.descripcion).toContain("solo las operaciones");
    expect(pdf?.ruta).toBe("src/lib/integrations/clients/stirling-pdf.ts");
  });

  it("se encuentran por tipo, origen y texto", () => {
    const herramientasOs = filtrarRecursos(catalogoDeclarado(), { tipo: "herramienta", origen: "os" });
    expect(herramientasOs.some((r) => r.id === "os:traducir")).toBe(true);
    const porTexto = (texto: string) => filtrarRecursos(RECURSOS_TRADUCCION_PDF, { texto });
    expect(porTexto("traducir").some((r) => r.id === "os:traducir")).toBe(true);
    expect(porTexto("pdf").some((r) => r.id === "astraura:editar-pdf")).toBe(true);
  });
});
