import { describe, it, expect } from "vitest";
import {
  OS_VERSION,
  OS_FECHA,
  OS_CANAL,
  OS_NOTAS,
  MEDIOS_DE_VERSION,
  formatearFechaBuild,
  versionMasReciente,
  etiquetaBuild,
} from "../version/os-release";

describe("os-release: constante de versión", () => {
  it("OS_VERSION y OS_FECHA apuntan a la misma fecha", () => {
    const [anio, dia, mes] = OS_VERSION.split(".").map(Number);
    expect(OS_FECHA).toBe(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  });

  it("OS_VERSION tiene formato AAAA.MM.DD", () => {
    expect(OS_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it("OS_CANAL es un canal válido", () => {
    expect(["alpha", "beta", "estable"]).toContain(OS_CANAL);
  });

  it("OS_NOTAS es texto no vacío", () => {
    expect(typeof OS_NOTAS).toBe("string");
    expect(OS_NOTAS.length).toBeGreaterThan(0);
  });

  it("MEDIOS_DE_VERSION vigila los medios esperados", () => {
    for (const medio of MEDIOS_DE_VERSION) {
      expect(typeof medio).toBe("string");
      expect(medio.length).toBeGreaterThan(0);
    }
    expect(MEDIOS_DE_VERSION).toContain("package.json");
  });
});

describe("formatearFechaBuild", () => {
  it("formatea el formato AAAA.MM.DD (puntos)", () => {
    expect(formatearFechaBuild("2026.09.09")).toBe("9 de septiembre de 2026");
  });

  it("formatea el formato AAAA-MM-DD (guiones)", () => {
    expect(formatearFechaBuild("2026-09-09")).toBe("9 de septiembre de 2026");
  });

  it("formatea el formato AAAA/MM/DD (barras)", () => {
    expect(formatearFechaBuild("2026/09/09")).toBe("9 de septiembre de 2026");
  });

  it("devuelve la cadena cruda ante basura, sin lanzar", () => {
    expect(formatearFechaBuild("no-una-fecha")).toBe("no-una-fecha");
    expect(formatearFechaBuild("")).toBe("");
    expect(formatearFechaBuild("2026.13.99")).toBe("2026.13.99");
    expect(formatearFechaBuild("2026.09")).toBe("2026.09");
  });
});

describe("versionMasReciente", () => {
  it("devuelve la más reciente aunque la lista esté desordenada", () => {
    const lista = [
      { version: "1", date: "2026.08.23" },
      { version: "2", date: "2026.07.01" },
      { version: "3", date: "2026.09.01" },
    ];
    const reciente = versionMasReciente(lista);
    expect(reciente).toBeDefined();
    expect(reciente!.version).toBe("3");
  });

  it("devuelve undefined con lista vacía", () => {
    expect(versionMasReciente([])).toBeUndefined();
  });

  it("tolera fechas inválidas (van al final) y sigue eligiendo la válida reciente", () => {
    const lista = [
      { version: "rota", date: "basura" },
      { version: "nueva", date: "2026.08.23" },
      { version: "media", date: "2026.07.01" },
    ];
    const reciente = versionMasReciente(lista);
    expect(reciente!.version).toBe("nueva");
  });

  it("devuelve undefined si ninguna fecha es válida", () => {
    expect(versionMasReciente([{ version: "a", date: "x" }])).toBeUndefined();
  });
});

describe("etiquetaBuild", () => {
  it("compone una etiqueta legible", () => {
    expect(etiquetaBuild()).toBe(`StarSeed OS · build ${OS_VERSION} · ${OS_CANAL}`);
  });
});