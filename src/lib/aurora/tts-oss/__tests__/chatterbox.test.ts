import { describe, it, expect } from "vitest";
import { spaceIdToHost, looksLikeChatterboxContract } from "@/lib/aurora/tts-oss/chatterbox";

describe("chatterbox (unit)", () => {
  describe("spaceIdToHost", () => {
    it("converts owner/space to host format", () => {
      expect(spaceIdToHost("resemble-ai/ChatterboxTTS")).toBe("resemble-ai-chatterboxtts");
      expect(spaceIdToHost("User_Name/Space.Name")).toBe("user-name-space-name");
      expect(spaceIdToHost("a/b/c")).toBe("a-b-c");
      expect(spaceIdToHost("  leading/trailing  ")).toBe("leading-trailing"); // spaces removed by regex
    });
  });

  describe("looksLikeChatterboxContract", () => {
    it("returns false for non-matching contracts", () => {
      // Since we don't have the real contract, we test that it returns false for some inputs.
      expect(looksLikeChatterboxContract(undefined)).toBe(false);
      expect(looksLikeChatterboxContract({})).toBe(false);
      expect(looksLikeChatterboxContract({ parameters: [] })).toBe(false);
      expect(looksLikeChatterboxContract({ parameters: [{}] })).toBe(false);
    });
  });
});