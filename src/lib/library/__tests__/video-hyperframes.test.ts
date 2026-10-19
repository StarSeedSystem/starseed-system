// Pruebas del paquete de HyperFrames (HFR1018B · Ola 1018H).

import { describe, it, expect } from "vitest";
import { STARSEED_LABS_REPO } from "../packages";

describe("Paquete de HyperFrames añadido", () => {
  const paqueteId = "video-hyperframes";
  const paquete = STARSEED_LABS_REPO.packages.find(pkg => pkg.id === paqueteId);

  describe("paquete encontrado", () => {
    it("existe el paquete", () => {
      expect(paquete).toBeDefined();
    });
  });

  describe("id único", () => {
    it("el id es único en el repositorio", () => {
      const ids = STARSEED_LABS_REPO.packages.map(p => p.id);
      const count = ids.filter(id => id === paqueteId).length;
      expect(count).toBe(1);
    });
  });

  describe("githubRepo presente", () => {
    it("tiene githubRepo en el payload", () => {
      expect(paquete).toBeDefined();
      const githubRepo = (paquete?.payload as any).githubRepo;
      expect(githubRepo).toBeDefined();
      expect(typeof githubRepo).toBe("string");
      expect(githubRepo).toBe("heygen-com/hyperframes");
    });
  });

  describe("claseLicencia", () => {
    it("tiene claseLicencia: libre", () => {
      expect(paquete).toBeDefined();
      const claseLicencia = (paquete?.payload as any).claseLicencia;
      expect(claseLicencia).toBeDefined();
      expect(claseLicencia).toBe("libre");
    });
  });
});