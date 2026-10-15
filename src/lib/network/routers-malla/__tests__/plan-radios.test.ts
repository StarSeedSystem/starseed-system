import { describe, it, expect } from "vitest";
import { planRadios, RouterMalla, RadioRouter } from "../plan-radios";

describe("planRadios", () => {
  it("should return empty output for empty input", () => {
    const result = planRadios({
      region: "EU",
      routers: [],
      troncales: [],
    });
    expect(result).toEqual({
      troncales: [],
      clientes: [],
      avisos: [],
    });
  });
});