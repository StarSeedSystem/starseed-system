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

const paquetes = REPO_EXTERNOS_1020.packages;

function payloadDe(id: string): Record<string, unknown> {
  const pkg = paquetes.find((p) => p.id === id);
  expect(pkg, id).toBeDefined();
  return pkg?.payload ?? {};
}

describe("REPO_EXTERNOS_1020 · repo builtin externo de la Ola 1020", () => {
  it("declara su identidad de repo builtin", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("mapea las 14 publicaciones del catálogo verificado", () => {
    expect(paquetes).toHaveLength(14);
  });

  it("tiene 14 ids únicos", () => {
    const ids = paquetes.map((p) => p.id);
    expect(new Set(ids).size).toBe(14);
    expect(ids).toHaveLength(14);
  });

  it("cada paquete apunta a su URL de GitHub", () => {
    for (const pkg of paquetes) {
      const url = pkg.payload.externalUrl;
      expect(typeof url, pkg.id).toBe("string");
      expect(url as string, pkg.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("cada paquete tiene githubRepo con forma owner/repo", () => {
    for (const pkg of paquetes) {
      const repo = pkg.payload.githubRepo;
      expect(typeof repo, pkg.id).toBe("string");
      expect(repo as string, pkg.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("todas son externas y honestas: comingSoon y sin ruta de instalación", () => {
    for (const pkg of paquetes) {
      expect(pkg.comingSoon, pkg.id).toBe(true);
      expect(pkg.free, pkg.id).toBe(true);
      expect(pkg.sourceRepoId, pkg.id).toBe("starseed-biblioteca-externa");
      expect(pkg.payload.route, pkg.id).toBeUndefined();
      expect(pkg.version, pkg.id).toBe("1.0.0");
    }
  });

  it("ningún id ni repo contiene 'reverse-skill'", () => {
    for (const pkg of paquetes) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(String(pkg.payload.githubRepo)).not.toContain("reverse-skill");
      expect(String(pkg.payload.externalUrl)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy lleva skillId 'anatomy'", () => {
    expect(payloadDe("lib-anatomy").skillId).toBe("anatomy");
  });

  it("lib-gods-eye se coloca en el área 'mapas'", () => {
    expect(payloadDe("lib-gods-eye").area as string[]).toContain("mapas");
  });

  it("conserva canal, área y licencia de cada entrada", () => {
    const wordcraft = payloadDe("lib-wordcraft");
    expect(wordcraft.canal).toBe("releases");
    expect(wordcraft.licencia).toBe("Apache-2.0");
    expect(wordcraft.area).toEqual(["Documentos", "Protomolecula"]);
    expect(payloadDe("lib-wechaty").canal).toBe("tags");
  });
});

describe("PAQUETES_EXTERNOS · 2.ª tanda fusionada con la 1.ª", () => {
  const ids = PAQUETES_EXTERNOS.map((p) => p.id);
  const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);
  const externalUrls = PAQUETES_EXTERNOS.map((p) => p.externalUrl);

  it("tienen 28 ids únicos", () => {
    expect(new Set(ids).size).toBe(28);
    expect(ids.length).toBe(28);
  });

  it("cada paquete tiene githubRepo y externalUrl de GitHub", () => {
    for (const repo of githubRepos) expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    for (const url of externalUrls) {
      expect(url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("no aparecen las exclusiones de seguridad de ninguna tanda", () => {
    expect(ids).not.toContain("zhaoxuya520/reverse-skill");
    expect(ids).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    for (const p of PAQUETES_EXTERNOS) {
      expect(p.repo).not.toContain("reverse-skill");
      expect(p.repo).not.toBe("Vikunja-Self-Hosted/Vikunja-Task-Management");
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
