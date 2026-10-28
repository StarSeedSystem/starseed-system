import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";
import { listRepos } from "../packages";

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

  it("no incluye ningún repo de la lista de exclusiones", () => {
    for (const pkg of paquetes) {
      expect(REPOS_EXCLUIDOS, pkg.id).not.toContain(String(pkg.payload.githubRepo));
    }
  });

  it("asigna el icono según el kind de cada entrada", () => {
    const icono = (id: string) => paquetes.find((p) => p.id === id)?.icon;
    expect(icono("lib-wordcraft")).toBe("AppWindow");
    expect(icono("lib-artemis")).toBe("BrainCircuit");
    expect(icono("lib-anatomy")).toBe("Boxes");
  });

  it("respeta la descripción: que_es y, si existe, el aviso tras un guion", () => {
    const wordcraft = paquetes.find((p) => p.id === "lib-wordcraft");
    expect(wordcraft?.description).toContain("Procesador de textos");
    expect(wordcraft?.description).toContain(" — ");
    const artemis = paquetes.find((p) => p.id === "lib-artemis");
    expect(artemis?.description).toBe("Automatiza teléfonos Android reales desde lenguaje natural; trae servidor MCP.");
  });

  it("las tags reúnen área, canal y marca de licencia", () => {
    const tags = payloadDe("lib-gods-eye");
    const pkg = paquetes.find((p) => p.id === "lib-gods-eye");
    expect(pkg?.tags).toContain("mapas");
    expect(pkg?.tags).toContain("releases");
    expect(pkg?.tags).toContain("lic");
    expect(Array.isArray(tags.area)).toBe(true);
  });

  it("el repo builtin está en listRepos()", () => {
    expect(listRepos().some((r) => r.id === "starseed-biblioteca-externa")).toBe(true);
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
