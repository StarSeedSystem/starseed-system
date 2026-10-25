import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPO_EXTERNOS_1020, PAQUETES_1020 } from "../repos-externos-1020";

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

describe("REPO_EXTERNOS_1020 · repo builtin «Biblioteca externa» (1.ª tanda, 14)", () => {
  it("declara el repo builtin con su id y 14 paquetes con 14 ids únicos", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
    expect(PAQUETES_1020.length).toBe(14);
    const ids = PAQUETES_1020.map((p) => p.id);
    expect(new Set(ids).size).toBe(14);
    expect(ids).toContain("lib-wordcraft");
  });

  it("cada paquete lleva payload.externalUrl y payload.githubRepo de GitHub (owner/repo)", () => {
    for (const p of PAQUETES_1020) {
      const url = p.payload.externalUrl;
      const repo = p.payload.githubRepo;
      expect(typeof url).toBe("string");
      expect(url as string).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      expect(typeof repo).toBe("string");
      expect(repo as string).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("NINGÚN id ni repo contiene reverse-skill (excluida por seguridad)", () => {
    for (const p of PAQUETES_1020) {
      expect(p.id).not.toContain("reverse-skill");
      expect(String(p.payload.githubRepo)).not.toContain("reverse-skill");
      expect(String(p.payload.externalUrl)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy es función de agente con payload.skillId = anatomy", () => {
    const anatomy = PAQUETES_1020.find((p) => p.id === "lib-anatomy");
    expect(anatomy?.kind).toBe("function");
    expect(anatomy?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye entra en el área de mapas (app externa honesta)", () => {
    const godsEye = PAQUETES_1020.find((p) => p.id === "lib-gods-eye");
    expect(godsEye?.kind).toBe("app");
    expect(godsEye?.payload.area).toContain("mapas");
    expect(godsEye?.comingSoon).toBe(true);
  });

  it("fichas honestas: descripción con que_es (+ aviso si viene) y canal en el payload", () => {
    const wordcraft = PAQUETES_1020.find((p) => p.id === "lib-wordcraft");
    expect(wordcraft?.description).toContain("Procesador de textos open source");
    expect(wordcraft?.description).toContain("fijar la versión por SHA/tag");
    expect(wordcraft?.payload.canal).toBe("releases");
    for (const p of PAQUETES_1020) {
      expect(p.free).toBe(true);
      expect(p.comingSoon).toBe(true);
      expect(p.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });
});