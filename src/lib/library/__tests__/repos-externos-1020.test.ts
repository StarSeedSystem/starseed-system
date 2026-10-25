import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";

const paquetes = REPO_EXTERNOS_1020.packages;

function payloadDe(id: string): Record<string, unknown> {
  const pkg = paquetes.find((p) => p.id === id);
  expect(pkg).toBeDefined();
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
      expect(typeof url).toBe("string");
      expect(url as string).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("cada paquete tiene githubRepo con forma owner/repo", () => {
    for (const pkg of paquetes) {
      const repo = pkg.payload.githubRepo;
      expect(typeof repo).toBe("string");
      expect(repo as string).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("todas son externas y honestas: comingSoon y sin ruta de instalación", () => {
    for (const pkg of paquetes) {
      expect(pkg.comingSoon).toBe(true);
      expect(pkg.free).toBe(true);
      expect(pkg.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(pkg.payload.route).toBeUndefined();
      expect(pkg.version).toBe("1.0.0");
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
    const area = payloadDe("lib-gods-eye").area as string[];
    expect(area).toContain("mapas");
  });

  it("conserva canal, área y licencia de cada entrada", () => {
    const wordcraft = payloadDe("lib-wordcraft");
    expect(wordcraft.canal).toBe("releases");
    expect(wordcraft.licencia).toBe("Apache-2.0");
    expect(wordcraft.area).toEqual(["Documentos", "Protomolecula"]);
    expect(payloadDe("lib-wechaty").canal).toBe("tags");
  });
});
