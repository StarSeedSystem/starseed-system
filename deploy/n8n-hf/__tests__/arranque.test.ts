import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ARRANQUE_PATH = join(__dirname, "..", "arranque.sh");
const DOCKERFILE_PATH = join(__dirname, "..", "Dockerfile");

describe("n8n HF deployment fixes", () => {
  describe("arranque.sh", () => {
    it("usa --update en lugar de --separate para evitar duplicación de flujos", () => {
      const content = readFileSync(ARRANQUE_PATH, "utf-8");
      expect(content).toContain("n8n import:workflow --input=\"$f\" --update");
      expect(content).not.toContain("--separate");
    });
  });

  describe("Dockerfile", () => {
    it("establece N8N_SECURE_COOKIE=true para cookies seguras en HTTPS", () => {
      const content = readFileSync(DOCKERFILE_PATH, "utf-8");
      expect(content).toContain("N8N_SECURE_COOKIE=true");
      expect(content).not.toContain("N8N_SECURE_COOKIE=false");
    });
  });
});