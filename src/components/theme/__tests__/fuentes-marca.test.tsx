// Fuentes de la marca: Satoshi solo por el CSS de Fontshare, Quicksand para Natural y
// variables con respaldo. Las pruebas no tocan la red: simulan enlaces ya puestos en el DOM.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  FuentesMarca,
  HOJAS,
  hojasRequeridas,
  planHojas,
  variableDePapel,
  variablesDeMarca,
} from "../fuentes-marca";

afterEach(() => {
  cleanup();
  document.querySelectorAll("link[data-ss-fuente]").forEach((enlace) => enlace.remove());
});

describe("fuentes de la marca", () => {
  it("Satoshi se pide por el CSS alojado de Fontshare, nunca como archivo del repo", () => {
    expect(HOJAS.satoshi.href).toBe(
      "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap",
    );
    expect(HOJAS.satoshi.href.startsWith("https://api.fontshare.com/")).toBe(true);
    expect(HOJAS.satoshi.href.endsWith(".woff2")).toBe(false);
  });

  it("las pilas llevan respaldo si la fuente no carga", () => {
    expect(variableDePapel("display")).toBe(
      "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif",
    );
    expect(variableDePapel("titular")).toContain("'Rajdhani'");
    expect(variableDePapel("organica")).toContain("'Quicksand'");
    expect(variableDePapel("organica")).toContain("'Inter'");
  });

  it("expone las tres variables con su respaldo", () => {
    expect(variablesDeMarca()).toEqual({
      "--ss-font-display": variableDePapel("display"),
      "--ss-font-titular": variableDePapel("titular"),
      "--ss-font-organica": variableDePapel("organica"),
    });
  });
});

describe("hojas requeridas", () => {
  it("pide Satoshi cuando el registro es display editorial", () => {
    expect(hojasRequeridas({ registro: "display editorial" }).map((h) => h.id)).toEqual(["satoshi"]);
  });

  it("pide Quicksand para el tema Natural", () => {
    expect(hojasRequeridas({ tema: "Natural" }).map((h) => h.id)).toEqual(["quicksand"]);
  });

  it("no pide hojas para el papel titular técnico", () => {
    expect(hojasRequeridas({ papeles: ["titular"], registro: "titular técnico" })).toEqual([]);
  });

  it("junta display y orgánico sin repetir familia", () => {
    const ids = hojasRequeridas({ papeles: ["display", "organica", "display"], tema: "natural" });
    expect(ids.map((h) => h.id)).toEqual(["satoshi", "quicksand"]);
  });
});

describe("planHojas", () => {
  it("no repite una hoja ya puesta en el documento", () => {
    expect(planHojas([HOJAS.satoshi.href], [HOJAS.satoshi])).toEqual([]);
  });

  it("deduplica aunque la misma hoja se pida dos veces", () => {
    const faltan = planHojas([], [HOJAS.satoshi, HOJAS.satoshi, HOJAS.quicksand]);
    expect(faltan.map((h) => h.id)).toEqual(["satoshi", "quicksand"]);
  });
});

describe("FuentesMarca", () => {
  it("carga la hoja una sola vez aunque se monte dos veces", () => {
    const { container } = render(
      <FuentesMarca registro="display editorial">
        <span>Pieza editorial</span>
      </FuentesMarca>,
    );
    const primera = container.querySelector<HTMLElement>("[data-ss-fuentes]");
    expect(primera?.style.getPropertyValue("--ss-font-display")).toContain("Satoshi");

    cleanup();
    render(
      <FuentesMarca registro="display editorial">
        <span>Pieza editorial</span>
      </FuentesMarca>,
    );
    expect(document.querySelectorAll('link[data-ss-fuente="satoshi"]')).toHaveLength(1);
  });
});
