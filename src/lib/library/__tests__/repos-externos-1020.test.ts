import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPO_EXTERNOS_1020, REPOS_EXCLUIDOS } from "../repos-externos-1020";
import { listRepos } from "../packages";

const pkgs = REPO_EXTERNOS_1020.packages;

describe("repos-externos-1020 · repo builtin de 14 publicaciones", () => {
  it("14 ids únicas", () => {
    expect(pkgs).toHaveLength(14);
    expect(new Set(pkgs.map((p) => p.id)).size).toBe(14);
  });

  it("externalUrl y githubRepo bien formados, todo comingSoon", () => {
    for (const p of pkgs) {
      expect(String(p.payload.externalUrl)).toMatch(/^https:\/\/github\.com\//);
      expect(String(p.payload.githubRepo)).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(p.comingSoon).toBe(true);
    }
  });

  it("excluye reverse-skill", () => {
    expect(JSON.stringify(pkgs)).not.toContain("reverse-skill");
    for (const p of pkgs) {
      expect(p.id).not.toContain("reverse-skill");
      expect(String(p.payload.githubRepo)).not.toContain("reverse-skill");
    }
  });

  it("anatomy lleva skillId y gods-eye está en mapas", () => {
    expect(pkgs.find((p) => p.id === "lib-anatomy")?.payload.skillId).toBe("anatomy");
    expect(pkgs.find((p) => p.id === "lib-gods-eye")?.payload.area).toContain("mapas");
  });

  it("está en listRepos()", () => {
    expect(listRepos().some((r) => r.id === "starseed-biblioteca-externa")).toBe(true);
  });
});

describe("repos-externos-1020 · cargador de las dos tandas", () => {
  it("28 ids únicos entre 1020 y 1020b", () => {
    expect(PAQUETES_EXTERNOS).toHaveLength(28);
    expect(new Set(PAQUETES_EXTERNOS.map((p) => p.id)).size).toBe(28);
  });

  it("cada paquete tiene externalUrl y githubRepo de GitHub", () => {
    for (const p of PAQUETES_EXTERNOS) {
      expect(p.externalUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      expect(p.githubRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("respeta las exclusiones de las dos tandas", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(PAQUETES_EXTERNOS.some((p) => p.repo === "zhaoxuya520/reverse-skill")).toBe(false);
  });

  it("usa el Vikunja real y no el señuelo", () => {
    expect(PAQUETES_EXTERNOS.find((p) => p.githubRepo === "go-vikunja/vikunja")?.id).toBe("lib-vikunja");
  });
});
