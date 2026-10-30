import { describe, expect, it } from "vitest";

import {
  calcularAplazamiento,
  debeMostrarElegirFondo,
  DIAS_APLAZAMIENTO,
  MS_POR_DIA,
  VERSION_CATALOGO_DEFECTO,
  type EntradaFondoInicial,
} from "../fondo-inicial";

const AHORA = 1_700_000_000_000; // Timestamp fijo para tests deterministas
const EN_7_DIAS = AHORA + DIAS_APLAZAMIENTO * MS_POR_DIA;
const EN_3_DIAS = AHORA + 3 * MS_POR_DIA;
const HACE_1_DIA = AHORA - MS_POR_DIA;

function base(parcial: Partial<EntradaFondoInicial> = {}): EntradaFondoInicial {
  return {
    esPerfilNuevo: false,
    yaEligio: false,
    versionCatalogoVista: 0,
    versionCatalogoActual: 1,
    aplazadoHasta: 0,
    ahora: AHORA,
    ...parcial,
  };
}

describe("debeMostrarElegirFondo · perfil nuevo", () => {
  it("siempre muestra al crear un perfil nuevo", () => {
    const r = debeMostrarElegirFondo(base({ esPerfilNuevo: true }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("perfil-nuevo");
    expect(r.puedeAplazar).toBe(true);
  });

  it("perfil nuevo ignora versión de catálogo y aplazamiento", () => {
    const r = debeMostrarElegirFondo(base({
      esPerfilNuevo: true,
      versionCatalogoVista: 5,
      versionCatalogoActual: 1,
      aplazadoHasta: EN_7_DIAS,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("perfil-nuevo");
  });
});

describe("debeMostrarElegirFondo · ya eligió en versión actual", () => {
  it("no muestra si ya eligió y catálogo no cambió", () => {
    const r = debeMostrarElegirFondo(base({
      yaEligio: true,
      versionCatalogoVista: 1,
      versionCatalogoActual: 1,
    }));
    expect(r.mostrar).toBe(false);
    expect(r.motivo).toBe("no-mostrar");
    expect(r.puedeAplazar).toBe(false);
  });

  it("no muestra aunque haya aplazamiento vencido si ya eligió en versión actual", () => {
    const r = debeMostrarElegirFondo(base({
      yaEligio: true,
      versionCatalogoVista: 1,
      versionCatalogoActual: 1,
      aplazadoHasta: HACE_1_DIA, // vencido
    }));
    expect(r.mostrar).toBe(false);
    expect(r.motivo).toBe("no-mostrar");
  });
});

describe("debeMostrarElegirFondo · novedades en catálogo", () => {
  it("muestra si el catálogo subió de versión", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 2,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("novedades-catalogo");
    expect(r.puedeAplazar).toBe(true);
  });

  it("respeta aplazamiento vigente aunque haya novedades", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 2,
      aplazadoHasta: EN_3_DIAS, // aún vigente
    }));
    expect(r.mostrar).toBe(false);
    expect(r.motivo).toBe("no-mostrar");
    expect(r.puedeAplazar).toBe(false);
  });

  it("muestra si aplazamiento vencido y hay novedades", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 2,
      aplazadoHasta: HACE_1_DIA, // vencido
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("novedades-catalogo");
  });

  it("varias versiones de salto: muestra si actual > vista", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 5,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("novedades-catalogo");
  });
});

describe("debeMostrarElegirFondo · nunca vio el catálogo", () => {
  it("muestra si versionCatalogoVista === 0", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 0,
      versionCatalogoActual: 1,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("nunca-visto");
    expect(r.puedeAplazar).toBe(true);
  });

  it("respeta aplazamiento vigente aunque nunca vio el catálogo", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 0,
      versionCatalogoActual: 1,
      aplazadoHasta: EN_3_DIAS,
    }));
    expect(r.mostrar).toBe(false);
    expect(r.motivo).toBe("no-mostrar");
  });

  it("muestra si aplazamiento vencido y nunca vio el catálogo", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 0,
      versionCatalogoActual: 1,
      aplazadoHasta: HACE_1_DIA,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("aplazado-vencido");
  });
});

describe("debeMostrarElegirFondo · aplazamiento vencido", () => {
  it("muestra con motivo aplazado-vencido cuando aplazadoHasta pasó", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 1,
      aplazadoHasta: HACE_1_DIA,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("aplazado-vencido");
    expect(r.puedeAplazar).toBe(true);
  });

  it("no muestra si aplazadoHasta es futuro (aunque versionVista < actual)", () => {
    const r = debeMostrarElegirFondo(base({
      versionCatalogoVista: 1,
      versionCatalogoActual: 2,
      aplazadoHasta: EN_3_DIAS,
    }));
    expect(r.mostrar).toBe(false);
    expect(r.motivo).toBe("no-mostrar");
  });
});

describe("debeMostrarElegirFondo · casos frontera", () => {
  it("aplazadoHasta === ahora se considera vencido (>=)", () => {
    const r = debeMostrarElegirFondo(base({
      aplazadoHasta: AHORA,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("aplazado-vencido");
  });

  it("versionCatalogoVista === versionCatalogoActual sin yaEligio → nunca-visto", () => {
    const r = debeMostrarElegirFondo(base({
      yaEligio: false,
      versionCatalogoVista: 1,
      versionCatalogoActual: 1,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("nunca-visto");
  });

  it("yaEligio=true pero versionVista < versionActual → novedades-catalogo", () => {
    const r = debeMostrarElegirFondo(base({
      yaEligio: true,
      versionCatalogoVista: 1,
      versionCatalogoActual: 2,
    }));
    expect(r.mostrar).toBe(true);
    expect(r.motivo).toBe("novedades-catalogo");
  });
});

describe("calcularAplazamiento", () => {
  it("devuelve ahora + 7 días en ms", () => {
    expect(calcularAplazamiento(AHORA)).toBe(EN_7_DIAS);
  });

  it("funciona con cualquier timestamp", () => {
    const t = 1_000_000_000_000;
    expect(calcularAplazamiento(t)).toBe(t + DIAS_APLAZAMIENTO * MS_POR_DIA);
  });
});

describe("constantes", () => {
  it("DIAS_APLAZAMIENTO es 7", () => {
    expect(DIAS_APLAZAMIENTO).toBe(7);
  });

  it("MS_POR_DIA es 24*60*60*1000", () => {
    expect(MS_POR_DIA).toBe(24 * 60 * 60 * 1000);
  });

  it("VERSION_CATALOGO_DEFECTO es 1", () => {
    expect(VERSION_CATALOGO_DEFECTO).toBe(1);
  });
});