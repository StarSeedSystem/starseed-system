import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020, mapearEntradaExterna } from "../repos-externos-1020";
import { allPackages, listRepos, validateRepoShape } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;

describe("REPO_EXTERNOS_1020 · repo builtin de la Ola 1020", () => {
  it("es un repo builtin con id y nombre estables", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
  });

  it("publica exactamente las 14 entradas del catálogo", () => {
    expect(paquetes).toHaveLength(14);
  });

  it("tiene ids únicos", () => {
    const ids = paquetes.map((paquete) => paquete.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada paquete trae externalUrl de GitHub", () => {
    for (const paquete of paquetes) {
      expect(paquete.payload.externalUrl).toMatch(/^https:\/\/github\.com\/.+/);
    }
  });

  it("cada paquete trae githubRepo con forma owner/repo", () => {
    for (const paquete of paquetes) {
      expect(paquete.payload.githubRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("ningún id ni repo contiene reverse-skill (excluida por seguridad)", () => {
    for (const paquete of paquetes) {
      expect(paquete.id).not.toContain("reverse-skill");
      expect(paquete.payload.githubRepo).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy lleva el skillId anatomy", () => {
    const anatomy = paquetes.find((paquete) => paquete.id === "lib-anatomy");
    expect(anatomy).toBeDefined();
    expect(anatomy?.payload.skillId).toBe("anatomy");
    expect(anatomy?.kind).toBe("function");
  });

  it("lib-gods-eye está en el área mapas y se declara externa", () => {
    const godsEye = paquetes.find((paquete) => paquete.id === "lib-gods-eye");
    expect(godsEye).toBeDefined();
    expect(godsEye?.payload.area).toContain("mapas");
    expect(godsEye?.payload.licencia).toContain("NC");
  });

  it("todas son gratuitas, sin efecto real aún y con su canal", () => {
    for (const paquete of paquetes) {
      expect(paquete.free).toBe(true);
      expect(paquete.comingSoon).toBe(true);
      expect(paquete.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(["releases", "tags", "commits"]).toContain(paquete.payload.canal);
    }
  });

  it("el repo está en listRepos() junto a los builtins", () => {
    expect(listRepos().some((repo) => repo.id === "starseed-biblioteca-externa")).toBe(true);
  });

  it("sus 14 paquetes llegan al catálogo unificado con su repo de origen", () => {
    const externos = allPackages().filter(
      (paquete) => paquete.sourceRepoId === "starseed-biblioteca-externa",
    );
    expect(externos).toHaveLength(14);
  });

  it("un catálogo externo con shape `paquetes` usa el mismo mapeador", () => {
    const repo = validateRepoShape({
      id: "catalogo-externo-prueba",
      name: "Catálogo de prueba",
      paquetes: [
        {
          id: "lib-prueba",
          repo: "owner/repo",
          nombre: "Prueba",
          kind: "app",
          canal: "tags",
          area: ["mapas"],
          que_es: "Una entrada de prueba.",
        },
      ],
    });
    expect(repo?.packages).toHaveLength(1);
    expect(repo?.packages[0]?.sourceRepoId).toBe("catalogo-externo-prueba");
    expect(repo?.packages[0]?.payload.githubRepo).toBe("owner/repo");
    expect(repo?.packages[0]?.payload.externalUrl).toBe("https://github.com/owner/repo");
  });

  it("descarta una entrada con repo mal formado en vez de publicar a medias", () => {
    expect(
      mapearEntradaExterna({
        id: "lib-rotto",
        repo: "sin-dueno",
        nombre: "Roto",
        kind: "app",
        canal: "releases",
        area: [],
        que_es: "No debería publicarse.",
      }),
    ).toBeNull();
  });
});
