import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);
const externalUrls = PAQUETES_EXTERNOS.map((p) => p.externalUrl);

describe("repos-externos-1020 · 3.ª tanda merged con 1.ª y 2.ª", () => {
  it("tienen 41 ids únicos (28 anteriores + 13 nuevas)", () => {
    expect(new Set(ids).size).toBe(41);
    expect(ids.length).toBe(41);
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
    expect(ids).not.toContain("zhaoxuya520/reverse-skill");
    expect(githubRepos).not.toContain("zhaoxuya520/reverse-skill");
  });

  it("no aparece Vikunja-Self-Hosted/Vikunja-Task-Management (excluida 2.ª tanda)", () => {
    expect(ids).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(githubRepos).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
  });

  it("no aparece Kritt-ai/open-kritt (excluida 3.ª tanda)", () => {
    expect(ids).not.toContain("Kritt-ai/open-kritt");
    expect(githubRepos).not.toContain("Kritt-ai/open-kritt");
  });

  it("go-vikunja/vikunja aparece en githubRepo (de la 2.ª tanda)", () => {
    const entry = PAQUETES_EXTERNOS.find((p) => p.githubRepo === "go-vikunja/vikunja");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("lib-vikunja");
  });

  it("unslothai/unsloth aparece en githubRepo (de la 1.ª tanda)", () => {
    const entry = PAQUETES_EXTERNOS.find((p) => p.githubRepo === "unslothai/unsloth");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("lib-unsloth");
  });

  it("penpot/penpot NO aparece en PAQUETES_EXTERNOS (ya existe como iatool-penpot)", () => {
    const entry = PAQUETES_EXTERNOS.find((p) => p.githubRepo === "penpot/penpot");
    expect(entry).toBeUndefined();
  });

  it("penpot/penpot aparece en REPOS_YA_PRESENTES con id iatool-penpot", () => {
    const yaPresente = REPOS_YA_PRESENTES.find((r) => r.repo === "penpot/penpot");
    expect(yaPresente).toBeDefined();
    expect(yaPresente?.id).toBe("iatool-penpot");
  });

  it("las 13 nuevas de la 3.ª tanda están en PAQUETES_EXTERNOS", () => {
    const idsTanda3 = [
      "lib-openworker",
      "lib-trail-code",
      "lib-img2threejs",
      "lib-openwhispr",
      "lib-paperclip",
      "lib-magnitude",
      "lib-artcraft",
      "lib-pocketbase",
      "lib-openmaic",
      "lib-chatwoot",
      "lib-excalidraw",
      "lib-nextcloud",
      "lib-supra-tex",
    ];
    for (const id of idsTanda3) {
      expect(ids).toContain(id);
    }
  });

  it("REPOS_EXCLUIDOS incluye las tres exclusiones", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
  });

  it("REPOS_YA_PRESENTES solo incluye penpot/penpot de la 3.ª tanda", () => {
    expect(REPOS_YA_PRESENTES).toHaveLength(1);
    expect(REPOS_YA_PRESENTES[0].repo).toBe("penpot/penpot");
    expect(REPOS_YA_PRESENTES[0].id).toBe("iatool-penpot");
  });
});