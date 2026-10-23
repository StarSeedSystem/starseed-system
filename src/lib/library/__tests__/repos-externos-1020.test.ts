import { describe, it, expect } from "vitest";
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
  });
});