import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";
import { listRepos } from "../packages";

const pkgs = REPO_EXTERNOS_1020.packages;

describe("repos-externos-1020", () => {
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
  });

  it("anatomy lleva skillId y gods-eye está en mapas", () => {
    expect(pkgs.find((p) => p.id === "lib-anatomy")?.payload.skillId).toBe("anatomy");
    expect(pkgs.find((p) => p.id === "lib-gods-eye")?.payload.area).toContain("mapas");
  });

  it("está en listRepos()", () => {
    expect(listRepos().some((r) => r.id === "starseed-biblioteca-externa")).toBe(true);
  });
});
