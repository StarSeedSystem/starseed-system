import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPO_EXTERNOS_1020 } from "../repos-externos-1020";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);
const externalUrls = PAQUETES_EXTERNOS.map((p) => p.externalUrl);

describe("repos-externos-1020 · 2.ª tanda merged con 1.ª", () => {
  it("tienen 28 ids únicos", () => {
    expect(new Set(ids).size).toBe(28);
    expect(ids.length).toBe(28);
  });

  it("cada paquete tiene payload.githubRepo de GitHub", () => {
    for (const repo of githubRepos) {
      expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("cada paquete tiene payload.externalUrl de GitHub", () => {
    for (const url of externalUrls) {
      expect(url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("no aparece zhaoxuya520/reverse-skill (excluida 1.ª tanda)", () => {
    const idsProhibidos = ["zhaoxuya520/reverse-skill"];
    for (const id of idsProhibidos) {
      expect(ids).not.toContain(id);
    }
  });

  it("no aparece Vikunja-Self-Hosted/Vikunja-Task-Management (excluida 2.ª tanda)", () => {
    const idsProhibidos = ["Vikunja-Self-Hosted/Vikunja-Task-Management"];
    for (const id of idsProhibidos) {
      expect(ids).not.toContain(id);
    }
  });

  it("go-vikunja/vikunja aparece en githubRepo", () => {
    const entry = PAQUETES_EXTERNOS.find((p) => p.githubRepo === "go-vikunja/vikunja");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("lib-vikunja");
  });

  it("REPOS_EXCLUIDOS incluye las dos exclusiones", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
  });
});

describe("REPO_EXTERNOS_1020 · repo builtin de la tanda 1020", () => {
  it("tiene id, nombre y marca builtin correctos", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("contiene las 14 publicaciones con ids únicos", () => {
    expect(REPO_EXTERNOS_1020.packages).toHaveLength(14);
    const ids = REPO_EXTERNOS_1020.packages.map((p) => p.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("cada paquete tiene externalUrl y githubRepo de GitHub", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.payload.externalUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      expect(pkg.payload.githubRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("ningún id ni repo contiene reverse-skill (excluida por seguridad)", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(String(pkg.payload.githubRepo)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy lleva payload.skillId anatomy", () => {
    const anatomy = REPO_EXTERNOS_1020.packages.find((p) => p.id === "lib-anatomy");
    expect(anatomy).toBeDefined();
    expect(anatomy?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye está en el área de mapas", () => {
    const godsEye = REPO_EXTERNOS_1020.packages.find((p) => p.id === "lib-gods-eye");
    expect(godsEye).toBeDefined();
    expect(godsEye?.payload.area).toContain("mapas");
  });

  it("todas van honestas con comingSoon (sin efecto real todavía)", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.comingSoon).toBe(true);
      expect(pkg.sourceRepoId).toBe("starseed-biblioteca-externa");
    }
  });
});