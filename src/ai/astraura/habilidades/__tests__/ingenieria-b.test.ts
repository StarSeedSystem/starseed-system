import { describe, it, expect } from "vitest";
import { 
  toSpec, 
  toTickets, 
  triage, 
  prototype, 
  research, 
  improveCodebaseArchitecture, 
  implement 
} from "@/ai/astraura/habilidades/ingenieria-b";

describe("ingenieria-b skills", () => {
  describe("toSpec", () => {
    it("returns a string", () => {
      const result = toSpec("sample conversation");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("toTickets", () => {
    it("returns an array of ticket objects", () => {
      const result = toTickets("sample spec");
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const ticket = result[0];
        expect(ticket).toHaveProperty("title");
        expect(ticket).toHaveProperty("description");
        expect(ticket).toHaveProperty("blockers");
        expect(typeof ticket.title).toBe("string");
        expect(typeof ticket.description).toBe("string");
        expect(Array.isArray(ticket.blockers)).toBe(true);
      }
    });
  });

  describe("triage", () => {
    it("returns an object with state property", () => {
      const issue = { id: "1", description: "test issue" };
      const result = triage(issue);
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("state");
      expect(result.id).toBe(issue.id);
      expect(result.description).toBe(issue.description);
      expect(typeof result.state).toBe("string");
    });
  });

  describe("prototype", () => {
    it("returns a string", () => {
      const result = prototype("design a button");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("research", () => {
    it("returns a string", () => {
      const result = research("what is the capital of France?");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("improveCodebaseArchitecture", () => {
    it("returns a string (HTML)", () => {
      const result = improveCodebaseArchitecture("a simple codebase");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      // Check if it looks like HTML
      expect(result.includes("<div>")).toBe(true);
    });
  });

  describe("implement", () => {
    it("returns a string", () => {
      const result = implement("spec: build a feature");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});