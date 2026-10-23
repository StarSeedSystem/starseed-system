import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";

function texto(payload: Record<string, unknown>, clave: string): string {
  const valor = payload[clave];
  return typeof valor === "string" ? valor : "";
}

function lista(payload: Record<string, unknown>, clave: string): string[] {
  const valor = payload[clave];
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

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
    expect(ids).not.toContain("zhaoxuya520/reverse-skill");
    expect(githubRepos).not.toContain("zhaoxuya520/reverse-skill");
  });

  it("no aparece Vikunja-Self-Hosted/Vikunja-Task-Management (excluida 2.ª tanda)", () => {
    expect(githubRepos).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
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

describe("REPO_EXTERNOS_1020 · 14 publicaciones externas", () => {
  const paquetes = REPO_EXTERNOS_1020.packages;

  it("es el repo builtin 'starseed-biblioteca-externa'", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("contiene 14 paquetes con ids únicos", () => {
    expect(paquetes).toHaveLength(14);
    const susIds = paquetes.map((p) => p.id);
    expect(new Set(susIds).size).toBe(14);
  });

  it("cada paquete tiene externalUrl de GitHub", () => {
    for (const pkg of paquetes) {
      expect(texto(pkg.payload, "externalUrl")).toMatch(/^https:\/\/github\.com\/.+/);
    }
  });

  it("cada paquete tiene githubRepo con forma owner/repo", () => {
    for (const pkg of paquetes) {
      expect(texto(pkg.payload, "githubRepo")).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("ningún id ni repo contiene 'reverse-skill'", () => {
    for (const pkg of paquetes) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(texto(pkg.payload, "githubRepo")).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy lleva skillId 'anatomy'", () => {
    const anatomyPkg = paquetes.find((p) => p.id === "lib-anatomy");
    expect(anatomyPkg).toBeDefined();
    expect(anatomyPkg?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye está en el área 'mapas'", () => {
    const godsEyePkg = paquetes.find((p) => p.id === "lib-gods-eye");
    expect(godsEyePkg).toBeDefined();
    expect(lista(godsEyePkg?.payload ?? {}, "area")).toContain("mapas");
  });

  it("todas quedan comingSoon (aún sin efecto local real)", () => {
    for (const pkg of paquetes) {
      expect(pkg.comingSoon).toBe(true);
    }
  });
});
