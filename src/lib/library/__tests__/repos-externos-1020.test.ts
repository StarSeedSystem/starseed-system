import { describe, it, expect } from "vitest";
<<<<<<< HEAD
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS } from "../repos-externos-1020";

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
=======
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";

describe("REPO_EXTERNOS_1020", () => {
  it("has correct id and name", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("contains 14 packages", () => {
    expect(REPO_EXTERNOS_1020.packages).toHaveLength(14);
  });

  it("has unique ids", () => {
    const ids = REPO_EXTERNOS_1020.packages.map(p => p.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("each package has externalUrl starting with https://github.com/", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.payload.externalUrl).toMatch(/^https:\/\/github\.com\/.+/);
    }
  });

  it("each package has githubRepo in owner/repo format", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.payload.githubRepo).toMatch(/^[^\/]+\/[^\/]+$/);
    }
  });

  it("no package id or githubRepo contains 'reverse-skill'", () => {
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(pkg.payload.githubRepo).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy has skillId anatomy", () => {
    const anatomyPkg = REPO_EXTERNOS_1020.packages.find(p => p.id === "lib-anatomy");
    expect(anatomyPkg).toBeDefined();
    expect(anatomyPkg?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye is in area 'mapas'", () => {
    const godsEyePkg = REPO_EXTERNOS_1020.packages.find(p => p.id === "lib-gods-eye");
    expect(godsEyePkg).toBeDefined();
    expect(godsEyePkg?.payload.area).toContain("mapas");
>>>>>>> be207c749 (Ola 1022C · Carril de alta capacidad en la nube · RLB1020Ab-d2: Biblioteca · repo builtin externo 1020 (14 publicaciones autoactualizables) (parte 2 de 3))
  });
});