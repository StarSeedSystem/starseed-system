import { describe, it, expect } from "vitest";
import { 
  sanearVersionesCapa, 
  type VersionesCapa, 
  fusionarVersionesMedios, 
  resumenVersionesTexto 
} from "../versiones-capa";

describe("sanearVersionesCapa", () => {
  it("returns empty object for non-object", () => {
    expect(sanearVersionesCapa(null)).toEqual({});
    expect(sanearVersionesCapa(undefined)).toEqual({});
    expect(sanearVersionesCapa([])).toEqual({});
    expect(sanearVersionesCapa("string")).toEqual({});
    expect(sanearVersionesCapa(42)).toEqual({});
  });

  it("discards unknown layers", () => {
    const input = { datos: "1.0", desconocida: "2.0" };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({ datos: "1.0" });
  });

  it("discards empty strings", () => {
    const input = { datos: "", interfaz: "1.0" };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({ interfaz: "1.0" });
  });

  it("discards strings longer than 40 characters", () => {
    const longString = "a".repeat(41);
    const input = { datos: longString, interfaz: "1.0" };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({ interfaz: "1.0" });
  });

  it("discards strings with invalid characters", () => {
    const input = { datos: "1.0!", interfaz: "1.0", sw: "1.0 @", modelos: "1.0#" };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({ interfaz: "1.0" });
  });

  it("accepts valid strings", () => {
    const input = { 
      datos: "2026.10.10", 
      interfaz: "v1.2.3", 
      sw: "1.0.0", 
      servicios: "2026-10-10", 
      modelos: "model_v2", 
      nativa: "tauri_1.0" 
    };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({
      datos: "2026.10.10",
      interfaz: "v1.2.3",
      sw: "1.0.0",
      servicios: "2026-10-10",
      modelos: "model_v2",
      nativa: "tauri_1.0"
    });
  });

  it("trims whitespace", () => {
    const input = { datos: "  1.0  ", interfaz: "\t2.0\n" };
    const output = sanearVersionesCapa(input);
    expect(output).toEqual({ datos: "1.0", interfaz: "2.0" });
  });
});

describe("fusionarVersionesMedios", () => {
  it("returns empty object for empty array", () => {
    expect(fusionarVersionesMedios([])).toEqual({});
  });

  it("picks the highest version for each layer", () => {
    const medios = [
      { versiones: { datos: "1.0.0", interfaz: "2.0" } },
      { versiones: { datos: "1.0.1", interfaz: "1.9" } },
      { versiones: { datos: "0.9.0", interfaz: "2.1" } },
    ];
    const output = fusionarVersionesMedios(medios);
    expect(output).toEqual({ datos: "1.0.1", interfaz: "2.1" });
  });

  it("ignores media with invalid versiones", () => {
    const medios = [
      { versiones: { datos: "1.0.0" } },
      { versiones: null },
      { versiones: { datos: "invalid!" } },
      { versiones: { datos: "2.0.0" } },
    ];
    const output = fusionarVersionesMedios(medios);
    expect(output).toEqual({ datos: "2.0.0" });
  });

  it("treats non-numeric segments as 0 and missing segments as 0", () => {
    const medios = [
      { versiones: { sw: "1.0" } },           // [1,0,0]
      { versiones: { sw: "1.0.0" } },         // [1,0,0]
      { versiones: { sw: "1.0.0.0" } },       // [1,0,0,0]
      { versiones: { sw: "1.0.a" } },         // [1,0,0,0] because 'a'->0
      { versiones: { sw: "1.0.0.b" } },       // [1,0,0,0] because 'b'->0
      { versiones: { sw: "2.0" } },           // [2,0,0] -> highest
    ];
    const output = fusionarVersionesMedios(medios);
    expect(output).toEqual({ sw: "2.0" });
  });

  it("handles mixed valid and invalid media", () => {
    const medios = [
      { versiones: { datos: "1.0.0", interfaz: "2.0" } },
      { versiones: { datos: "1.0.1", interfaz: "invalid" } },
      { versiones: { datos: "0.9.0", interfaz: "2.1" } },
      { versiones: { datos: "2.0.0", interfaz: "1.0" } },
    ];
    const output = fusionarVersionesMedios(medios);
    expect(output).toEqual({ datos: "2.0.0", interfaz: "2.1" });
  });
});

describe("resumenVersionesTexto", () => {
  it("returns correct string with all versions", () => {
    const versiones: VersionesCapa = {
      datos: "2026.10.10",
      interfaz: "2026.10.10",
      sw: "1.0.0",
      servicios: "2026.10.10",
      modelos: "2.0.0",
      nativa: "tauri-1.0"
    };
    const output = resumenVersionesTexto(versiones);
    expect(output).toBe("datos 2026.10.10 · interfaz 2026.10.10 · sw 1.0.0 · servicios 2026.10.10 · modelos 2.0.0 · nativa tauri-1.0");
  });

  it("returns 'sin dato' for missing layers", () => {
    const versiones: VersionesCapa = {
      datos: "2026.10.10",
      sw: "1.0.0"
    };
    const output = resumenVersionesTexto(versiones);
    expect(output).toBe("datos 2026.10.10 · interfaz sin dato · sw 1.0.0 · servicios sin dato · modelos sin dato · nativa sin dato");
  });

  it("returns all 'sin dato' for empty object", () => {
    const versiones: VersionesCapa = {};
    const output = resumenVersionesTexto(versiones);
    expect(output).toBe("datos sin dato · interfaz sin dato · sw sin dato · servicios sin dato · modelos sin dato · nativa sin dato");
  });
});