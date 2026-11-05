import { describe, it, expect } from "vitest";
import { permisosDe } from "../permisos-por-so";

describe("permisosDe", () => {
  it("debe retornar permisos válidos para macos", () => {
    const p = permisosDe("macos");
    expect(p.minVersion).toBe("12.0");
    expect(p.permissions.length).toBeGreaterThan(0);
    expect(p.permissions.some((perm) => perm.id === "shell:allow-execute")).toBe(true);
  });

  it("debe retornar permisos válidos para android", () => {
    const p = permisosDe("android");
    expect(p.limitations).toContain("No soporta autoarranque nativo");
  });
});
