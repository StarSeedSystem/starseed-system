import { describe, it, expect } from "vitest";
import {
  OS_VERSION,
  OS_FECHA,
  OS_CANAL,
  OS_NOTAS,
  MEDIOS_DE_VERSION,
  NATIVE_VERSION,
  NATIVE_TAG,
  formatearFechaBuild,
  versionMasReciente,
  etiquetaBuild,
  nativeInstallerAssets,
  nativeInstallerAssetsFor,
  compararVersiones,
  esVersionMasNueva,
} from "../version/os-release";

describe("os-release: constante de versión", () => {
  it("OS_VERSION y OS_FECHA apuntan a la misma fecha", () => {
    // OS_VERSION es AAAA.MM.DD (ver el comentario del módulo): los nombres de
    // las partes deben respetar ese orden para no comparar mes y día cruzados
    // (con un valor donde MM ≠ DD, como el 2026.09.24 actual, un cruce aquí
    // SÍ se nota — antes coincidía por casualidad con 2026.09.09).
    const [anio, mes, dia] = OS_VERSION.split(".").map(Number);
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

describe("nativeInstallerAssets", () => {
  it("NATIVE_TAG es 'v' + NATIVE_VERSION", () => {
    expect(NATIVE_TAG).toBe(`v${NATIVE_VERSION}`);
  });

  it("todas las URLs apuntan al NATIVE_TAG vigente y son https", () => {
    const assets = nativeInstallerAssets();
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(a.href).toContain(`/releases/download/${NATIVE_TAG}/`);
      expect(a.href.endsWith(a.filename)).toBe(true);
      expect(a.href.startsWith("https://")).toBe(true);
    }
  });

  it("macOS tiene un único instalador universal (no aarch64/x64 separados)", () => {
    const mac = nativeInstallerAssetsFor("macos");
    expect(mac).toHaveLength(1);
    expect(mac[0].filename).toContain("universal");
  });

  it("Linux solo ofrece x64/amd64 (native-build.yml no compila ARM64 Linux)", () => {
    const linux = nativeInstallerAssetsFor("linux");
    expect(linux.length).toBeGreaterThan(0);
    for (const a of linux) {
      expect(a.filename).not.toMatch(/aarch64|arm64/i);
    }
  });

  it("el nombre del APK sigue el patrón StarSeed-os-<version>.apk", () => {
    const android = nativeInstallerAssetsFor("android");
    expect(android).toHaveLength(1);
    expect(android[0].filename).toBe(`StarSeed-os-${NATIVE_VERSION}.apk`);
  });

  it("acepta version/tag explícitos (para probar otra release sin mutar el default)", () => {
    const assets = nativeInstallerAssets("9.9.9", "v9.9.9");
    expect(assets.every((a) => a.href.includes("/v9.9.9/") && a.filename.includes("9.9.9"))).toBe(true);
  });
});

describe("compararVersiones / esVersionMasNueva", () => {
  it("detecta mayor, menor e igual", () => {
    expect(compararVersiones("0.2.1", "0.2.0")).toBe(1);
    expect(compararVersiones("0.2.0", "0.2.1")).toBe(-1);
    expect(compararVersiones("0.2.0", "0.2.0")).toBe(0);
  });

  it("ignora el prefijo 'v' y tolera longitudes distintas", () => {
    expect(compararVersiones("v1.0", "1.0.0")).toBe(0);
    expect(compararVersiones("v1.1", "1.0.9")).toBe(1);
  });

  it("es tolerante ante basura: partes no numéricas cuentan como 0, nunca lanza", () => {
    expect(() => compararVersiones("abc", "1.0.0")).not.toThrow();
    expect(compararVersiones("", "0.0.1")).toBe(-1);
  });

  it("esVersionMasNueva refleja compararVersiones", () => {
    expect(esVersionMasNueva("0.2.1", "0.2.0")).toBe(true);
    expect(esVersionMasNueva("0.2.0", "0.2.0")).toBe(false);
    expect(esVersionMasNueva("0.1.9", "0.2.0")).toBe(false);
  });
});