import { describe, expect, it } from "vitest";
import { lineaInstalada } from "../os-download-card";
import type { Instalada } from "@/lib/actualizaciones/version-por-medio";

const base = { info: null } as unknown as Instalada;

describe("lineaInstalada (PER1108A)", () => {
  it("la app de escritorio de pruebas dice versión y canal", () => {
    const l = lineaInstalada({ ...base, medio: "escritorio", version: "0.5.1-prueba.26", fuente: "info_neurona" } as Instalada);
    expect(l).toContain("Instalada 0.5.1-prueba.26");
    expect(l).toMatch(/prueba/i);
  });
  it("la oficial dice «Oficial»", () => {
    expect(lineaInstalada({ ...base, medio: "android", version: "0.5.0", fuente: "info_neurona" } as Instalada)).toBe("Instalada 0.5.0 · Oficial");
  });
  it("en la web no hay nada instalado que contar", () => {
    expect(lineaInstalada({ ...base, medio: "web", version: "0.5.0", fuente: "version.json" } as Instalada)).toBeNull();
    expect(lineaInstalada(null)).toBeNull();
  });
});
