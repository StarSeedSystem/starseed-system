// Pruebas del paquete de HyperFrames (HFR1018B · Ola 1018H).

import { describe, it, expect } from "vitest";
import { STARSEED_LABS_REPO } from "../packages";

describe("Paquete de HyperFrames añadido", () => {
  const pkgId = "video-hyperframes";
  const pkg = STARSEED_LABS_REPO.packages.find(p => p.id === pkgId);

  describe("existe y tiene id correcto", () => {
    it("el paquete video-hyperframes está presente en STARSEED_LABS_REPO", () => {
      expect(pkg).toBeDefined();
    });

    it("el id del paquete es video-hyperframes", () => {
      expect(pkg?.id).toBe(pkgId);
    });
  });

  describe("githubRepo presente y correcto", () => {
    it("el paquete tiene githubRepo en su payload", () => {
      const githubRepo = (pkg?.payload as any)?.githubRepo;
      expect(githubRepo).toBeDefined();
      expect(typeof githubRepo).toBe("string");
      expect(githubRepo.length).toBeGreaterThan(0);
    });

    it("el githubRepo es heygen-com/hyperframes", () => {
      const githubRepo = (pkg?.payload as any)?.githubRepo;
      expect(githubRepo).toBe("heygen-com/hyperframes");
    });
  });

  describe("claseLicencia válida", () => {
    it("el paquete tiene claseLicencia: libre", () => {
      const claseLicencia = (pkg?.payload as any)?.claseLicencia;
      expect(claseLicencia).toBeDefined();
      expect(claseLicencia).toBe("libre");
    });
  });
});