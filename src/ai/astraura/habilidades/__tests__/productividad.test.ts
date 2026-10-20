import { describe, it, expect } from "vitest";
import { PRODUCTIVITY_SKILLS } from "../productividad";

// Pruebas para el array de habilidades de productividad
describe("PRODUCTIVITY_SKILLS", () => {
  it("should have 7 skills", () => {
    expect(PRODUCTIVITY_SKILLS).toHaveLength(7);
  });

  it.each(PRODUCTIVITY_SKILLS)("should have id, label, and systemPrompt for $id", ({ id, label, systemPrompt }) => {
    expect(typeof id).toBe("string");
    expect(typeof label).toBe("string");
    expect(typeof systemPrompt).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(label.length).toBeGreaterThan(0);
    expect(systemPrompt.length).toBeGreaterThan(0);
  });
});