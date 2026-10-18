import { describe, it, expect } from "vitest";
import { leerProcesos } from "../procesos-fuentes";

describe("leerProcesos", () => {
  it("should return an object with procesos, hardware, and fuentes", async () => {
    const result = await leerProcesos();
    
    expect(result).toHaveProperty("procesos");
    expect(result).toHaveProperty("hardware");
    expect(result).toHaveProperty("fuentes");
    
    expect(Array.isArray(result.procesos)).toBe(true);
    expect(Array.isArray(result.hardware)).toBe(true);
    expect(Array.isArray(result.fuentes)).toBe(true);
  });
});