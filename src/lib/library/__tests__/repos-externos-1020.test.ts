import { describe, it, expect } from "vitest";
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
  });
});