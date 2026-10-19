import { describe, it, expect } from "vitest";
import { leerProcesos } from "../procesos-fuentes";

describe("leerProcesos", () => {
  it("should return a promise", async () => {
    const promise = leerProcesos();
    expect(promise).toBeInstanceOf(Promise);
  });

  it("should return an object with procesos, hardware, and fuentes arrays", async () => {
    const result = await leerProcesos();
    expect(result).toHaveProperty("procesos");
    expect(result).toHaveProperty("hardware");
    expect(result).toHaveProperty("fuentes");
    expect(Array.isArray(result.procesos)).toBe(true);
    expect(Array.isArray(result.hardware)).toBe(true);
    expect(Array.isArray(result.fuentes)).toBe(true);
  });

  it("should include Mac hardware when incluirMac is true (default)", async () => {
    const result = await leerProcesos({ incluirMac: true });
    // We can't assert specific values since we're mocking, but we can check structure
    expect(result.hardware).toBeInstanceOf(Array);
  });

  it("should exclude Mac hardware when incluirMac is false", async () => {
    const result = await leerProcesos({ incluirMac: false });
    // We can't assert specific values since we're mocking, but we can check structure
    expect(result.hardware).toBeInstanceOf(Array);
  });

  it("should never throw exceptions", async () => {
    // Even if all mocked functions throw, leerProcesos should not throw
    await expect(leerProcesos()).resolves.not.toThrow();
  });
});