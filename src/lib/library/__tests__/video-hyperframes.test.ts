// Pruebas del paquete de HyperFrames (HFR1018B · Ola 1018H).

import { describe, it, expect } from "vitest";
import { STARSEED_IA_TOOLS_REPO } from "../packages";

describe("Paquete de HyperFrames", () => {
  const paquete = STARSEED_IA_TOOLS_REPO.packages.find(pkg => pkg.id === "iatool-hyperframes");

  describe("id único", () => {
    it("el paquete tiene el id esperado", () => {
      expect(paquete).toBeDefined();
      expect(paquete?.id).toBe("iatool-hyperframes");
    });
  });

  describe("githubRepo presente", () => {
    it("el paquete tiene githubRepo igual a heygen-com/hyperframes", () => {
      expect(paquete).toBeDefined();
      const githubRepo = (paquete.payload as any).githubRepo;
      expect(githubRepo).toBeDefined();
      expect(typeof githubRepo).toBe("string");
      expect(githubRepo).toBe("heygen-com/hyperframes");
    });
  });

  describe("claseLicencia válida", () => {
    it("el paquete tiene claseLicencia: libre", () => {
      expect(paquete).toBeDefined();
      const claseLicencia = (paquete.payload as any).claseLicencia;
      expect(claseLicencia).toBeDefined();
      expect(claseLicencia).toBe("libre");
    });
  });
});
