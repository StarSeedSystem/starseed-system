import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";
import { listRepos } from "../packages";

describe("Biblioteca · repo builtin externo de la Ola 1020", () => {
  it("es un repo builtin de la Biblioteca con las 14 publicaciones", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
    expect(REPO_EXTERNOS_1020.packages).toHaveLength(14);
  });

  it("cuelga de listRepos() junto a los demás repos builtin", () => {
    const repo = listRepos().find((r) => r.id === REPO_EXTERNOS_1020.id);
    expect(repo, "falta en listRepos()").toBeDefined();
    expect(repo?.builtin).toBe(true);
    expect(repo?.packages).toHaveLength(14);
  });

  it("las 14 ids son únicas", () => {
    const ids = REPO_EXTERNOS_1020.packages.map((p) => p.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("cada ficha apunta a su upstream en GitHub y declara canal y área", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(String(pkg.payload.externalUrl)).toMatch(
        /^https:\/\/github\.com\/[^/]+\/[^/]+$/
      );
      expect(String(pkg.payload.githubRepo)).toMatch(/^[^/]+\/[^/]+$/);
      expect(["releases", "commits", "tags"]).toContain(String(pkg.payload.canal));
      expect(Array.isArray(pkg.payload.area)).toBe(true);
      expect("assets" in pkg.payload).toBe(true);
    }
  });

  it("ninguna ficha viene de reverse-skill (excluida por seguridad)", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(String(pkg.payload.githubRepo)).not.toContain("reverse-skill");
      expect(JSON.stringify(pkg.payload)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy es una función de agente con su skillId", () => {
    const anatomy = REPO_EXTERNOS_1020.packages.find((p) => p.id === "lib-anatomy");
    expect(anatomy, "falta lib-anatomy").toBeDefined();
    expect(anatomy?.kind).toBe("function");
    expect(anatomy?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye alimenta el área de mapas y avisa de la licencia de sus datos", () => {
    const godsEye = REPO_EXTERNOS_1020.packages.find((p) => p.id === "lib-gods-eye");
    expect(godsEye, "falta lib-gods-eye").toBeDefined();
    expect(godsEye?.payload.area).toContain("mapas");
    expect(String(godsEye?.description)).toContain("CC-BY-NC");
  });

  it("honestidad radical: comingSoon, gratuita, autora = owner y aviso en la descripción", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.comingSoon).toBe(true);
      expect(pkg.free).toBe(true);
      expect(pkg.author).toBe(String(pkg.payload.githubRepo).split("/")[0]);
      expect(pkg.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(pkg.description.length).toBeGreaterThan(0);
    }
    const wordcraft = REPO_EXTERNOS_1020.packages.find((p) => p.id === "lib-wordcraft");
    expect(String(wordcraft?.description)).toContain("Proyecto joven");
  });
});
