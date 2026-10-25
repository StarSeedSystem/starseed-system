import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";

const paquetes = REPO_EXTERNOS_1020.packages;
const ids = paquetes.map((p) => p.id);

describe("REPO_EXTERNOS_1020 · repo builtin de la Ola 1020", () => {
  it("es el repo builtin «Biblioteca externa»", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("tiene exactamente 14 paquetes con ids únicos", () => {
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(14);
  });

  it("cada paquete apunta a su upstream de GitHub (externalUrl)", () => {
    for (const p of paquetes) {
      expect(p.payload.externalUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("cada payload.githubRepo tiene forma owner/repo y coincide con la externalUrl", () => {
    for (const p of paquetes) {
      const repo = p.payload.githubRepo;
      expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(p.payload.externalUrl).toBe("https://github.com/" + repo);
    }
  });

  it("NINGÚN id ni repo contiene «reverse-skill» (excluida por seguridad)", () => {
    for (const p of paquetes) {
      expect(p.id).not.toContain("reverse-skill");
      expect(String(p.payload.githubRepo)).not.toContain("reverse-skill");
    }
  });

  it("toda la repo es gratuita con comingSoon (aún sin efecto real)", () => {
    for (const p of paquetes) {
      expect(p.free).toBe(true);
      expect(p.comingSoon).toBe(true);
      expect(p.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(p.payload.route).toBeUndefined();
    }
  });

  it("cada description NO está vacía y lleva el aviso de licencia pegado si existe", () => {
    for (const p of paquetes) {
      expect(p.description.length).toBeGreaterThan(0);
    }
    const wordcraft = paquetes.find((p) => p.id === "lib-wordcraft");
    expect(wordcraft?.description).toContain("Procesador de textos");
    expect(wordcraft?.description).toContain("— ");
  });

  it("las tags incluyen las áreas del catálogo y el canal", () => {
    const unsloth = paquetes.find((p) => p.id === "lib-unsloth");
    expect(unsloth?.tags).toContain("capas-astraura");
    expect(unsloth?.tags).toContain("commits");
  });

  it("lib-anatomy es una función de agente con payload.skillId «anatomy»", () => {
    const anatomy = paquetes.find((p) => p.id === "lib-anatomy");
    expect(anatomy).toBeDefined();
    expect(anatomy?.kind).toBe("function");
    expect(anatomy?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye está en el área «mapas» y es app externa", () => {
    const godsEye = paquetes.find((p) => p.id === "lib-gods-eye");
    expect(godsEye).toBeDefined();
    expect(godsEye?.payload.area).toContain("mapas");
  });

  it("wordcraft declara sus assets de releases; ods declara licencia", () => {
    const wordcraft = paquetes.find((p) => p.id === "lib-wordcraft");
    expect(Array.isArray(wordcraft?.payload.assets)).toBe(true);
    const ods = paquetes.find((p) => p.id === "lib-ods");
    expect(ods?.payload.licencia).toContain("Apache-2.0");
  });
});
