import { describe, it, expect } from "vitest";
import {
  RECURSOS_TRADUCCION_PDF,
  catalogoDeclarado,
  disponibleEn,
} from "@/lib/agentes/taller";

const TRADUCIR = RECURSOS_TRADUCCION_PDF.find((r) => r.id === "os:traducir");
const EDITAR_PDF = RECURSOS_TRADUCCION_PDF.find((r) => r.id === "astraura:editar-pdf");

describe("herramientas «traducir» y «editar_pdf» del Taller", () => {
  it("declara exactamente las dos herramientas con ids únicos en todo el catálogo", () => {
    expect(RECURSOS_TRADUCCION_PDF).toHaveLength(2);
    expect(new Set(RECURSOS_TRADUCCION_PDF.map((r) => r.id)).size).toBe(2);

    const ids = catalogoDeclarado().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("os:traducir");
    expect(ids).toContain("astraura:editar-pdf");
  });

  it("existe «traducir» como herramienta del OS y sirve en cualquier máquina", () => {
    expect(TRADUCIR).toBeDefined();
    expect(TRADUCIR?.tipo).toBe("herramienta");
    expect(TRADUCIR?.origen).toBe("os");
    expect(TRADUCIR?.maquina).toBe("cualquiera");
    if (TRADUCIR) {
      expect(disponibleEn(TRADUCIR, "mac")).toBe(true);
      expect(disponibleEn(TRADUCIR, "nube")).toBe(true);
    }
  });

  it("existe «editar_pdf» como herramienta de Astraura y sirve en cualquier máquina", () => {
    expect(EDITAR_PDF).toBeDefined();
    expect(EDITAR_PDF?.tipo).toBe("herramienta");
    expect(EDITAR_PDF?.origen).toBe("astraura");
    expect(EDITAR_PDF?.maquina).toBe("cualquiera");
    if (EDITAR_PDF) {
      expect(disponibleEn(EDITAR_PDF, "mac")).toBe(true);
      expect(disponibleEn(EDITAR_PDF, "nube")).toBe(true);
    }
  });

  it("las dos declaran su regla de privacidad y sus tres alcances permitidos", () => {
    for (const recurso of RECURSOS_TRADUCCION_PDF) {
      expect(recurso.privacidad).toBeTruthy();
      const regla = recurso.privacidad ?? "";
      expect(regla).toContain("aparato");
      expect(regla).toContain("cuenta");
      expect(regla).toContain("cerebro");
      expect(regla).toContain("nunca");
    }
  });

  it("«traducir» usa el motor por capas y avisa de la instancia pública de pago", () => {
    expect(TRADUCIR?.ruta).toBe("src/lib/traduccion/motor.ts");
    expect(TRADUCIR?.descripcion).toContain("motor por capas");
    expect(TRADUCIR?.privacidad).toContain("instancia pública de pago");
  });

  it("«editar_pdf» usa Stirling-PDF y solo ofrece lo que la instancia tenga", () => {
    expect(EDITAR_PDF?.ruta).toBe("src/lib/integrations/clients/stirling-pdf.ts");
    expect(EDITAR_PDF?.descripcion).toContain("solo las operaciones que esa instancia tenga");
    expect(EDITAR_PDF?.privacidad).toContain("instancia ajena");
  });

  it("no inventa requisitos de entorno ni valores que parezcan claves", () => {
    const texto = JSON.stringify(RECURSOS_TRADUCCION_PDF);
    for (const patron of ["sk-", "gsk_", "nvapi-"]) expect(texto).not.toContain(patron);
    for (const recurso of RECURSOS_TRADUCCION_PDF) expect(recurso.requiere).toEqual([]);
  });
});
