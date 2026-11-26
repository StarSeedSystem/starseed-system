import { describe, it, expect } from "vitest";
import {
  validateArranqueScript,
  validateDockerfile,
  validateWorkflowFiles,
  validateAll,
} from "../validate";

describe("n8n-hf deployment validation (PRD1005Tbsb)", () => {
  describe("validateArranqueScript", () => {
    it("should pass validation after fix", () => {
      const result = validateArranqueScript();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should not use directory-wide import with --separate", () => {
      const result = validateArranqueScript();
      const hasOldImport = result.errors.some((e) =>
        e.includes("directory-wide import with --separate"),
      );
      expect(hasOldImport).toBe(false);
    });

    it("should check existing workflow IDs before import", () => {
      const result = validateArranqueScript();
      const missingCheck = result.errors.some((e) =>
        e.includes("Does not check existing workflow IDs"),
      );
      expect(missingCheck).toBe(false);
    });

    it("should have function to extract workflow ID", () => {
      const result = validateArranqueScript();
      const missingExtract = result.errors.some((e) =>
        e.includes("Missing function to extract workflow ID"),
      );
      expect(missingExtract).toBe(false);
    });

    it("should import workflows individually", () => {
      const result = validateArranqueScript();
      const missingIndividual = result.errors.some((e) =>
        e.includes("Does not import workflows individually"),
      );
      expect(missingIndividual).toBe(false);
    });
  });

  describe("validateDockerfile", () => {
    it("should pass validation", () => {
      const result = validateDockerfile();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should have N8N_SECURE_COOKIE=true", () => {
      const result = validateDockerfile();
      const missingSecureCookie = result.errors.some((e) =>
        e.includes("N8N_SECURE_COOKIE=true"),
      );
      expect(missingSecureCookie).toBe(false);
    });

    it("should not have N8N_SECURE_COOKIE=false", () => {
      const result = validateDockerfile();
      const hasInsecureCookie = result.errors.some((e) =>
        e.includes("N8N_SECURE_COOKIE=false"),
      );
      expect(hasInsecureCookie).toBe(false);
    });
  });

  describe("validateWorkflowFiles", () => {
    it("should pass validation", () => {
      const result = validateWorkflowFiles();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should have stable IDs starting with 'produccion-'", () => {
      const result = validateWorkflowFiles();
      const idErrors = result.errors.filter((e) => e.includes("stable 'id'"));
      expect(idErrors).toHaveLength(0);
    });
  });

  describe("validateAll", () => {
    it("should pass all validations", () => {
      const result = validateAll();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});