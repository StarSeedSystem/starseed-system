import { describe, it, expect } from "vitest";
import { generateVersionInfo, type VersionInfo } from "../version-info";

describe("generateVersionInfo", () => {
  it("devuelve un objeto con build, at, sha, rama y version", () => {
    const result = generateVersionInfo("0.3.0");

    expect(result).toHaveProperty("build");
    expect(result).toHaveProperty("at");
    expect(result).toHaveProperty("sha");
    expect(result).toHaveProperty("rama");
    expect(result).toHaveProperty("version");
  });

  it("version coincide con la versión del package.json", () => {
    const result = generateVersionInfo("1.2.3");

    expect(result.version).toBe("1.2.3");
  });

  it("build tiene el formato esperado (base36 timestamp + random)", () => {
    const result = generateVersionInfo("0.3.0");

    expect(typeof result.build).toBe("string");
    expect(result.build).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it("at es un timestamp ISO válido", () => {
    const result = generateVersionInfo("0.3.0");

    expect(() => new Date(result.at)).not.toThrow();
    expect(new Date(result.at).toISOString()).toBe(result.at);
  });

  it("sha y rama son null por defecto", () => {
    const result = generateVersionInfo("0.3.0");

    expect(result.sha).toBeNull();
    expect(result.rama).toBeNull();
  });

  it("cada llamada genera un build diferente", () => {
    const a = generateVersionInfo("0.3.0");
    const b = generateVersionInfo("0.3.0");

    expect(a.build).not.toBe(b.build);
  });
});