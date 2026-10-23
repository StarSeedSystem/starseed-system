import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";
import { listRepos } from "../packages";

const PAQUETES = REPO_EXTERNOS_1020.packages;

function porId(id: string) {
  const pkg = PAQUETES.find((p) => p.id === id);
  if (!pkg) throw new Error(`falta ${id}`);
  return pkg;
}

describe("Biblioteca · repo builtin externo de la Ola 1020", () => {
  it("es un repo builtin con las 14 publicaciones verificadas", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
    expect(PAQUETES).toHaveLength(14);
  });

  it("cuelga de listRepos() junto a los demás repos builtin", () => {
    const repo = listRepos().find((r) => r.id === REPO_EXTERNOS_1020.id);
    expect(repo, "falta en listRepos()").toBeDefined();
    expect(repo?.builtin).toBe(true);
    expect(repo?.packages).toHaveLength(14);
  });

  it("las 14 ids son únicas y llevan el prefijo lib-", () => {
    const ids = PAQUETES.map((p) => p.id);
    expect(ids).toEqual([...new Set(ids)]);
    for (const id of ids) expect(id).toMatch(/^lib-[a-z0-9-]+$/);
  });

  it("cada ficha apunta a su upstream de GitHub con forma owner/repo", () => {
    for (const pkg of PAQUETES) {
      const externalUrl = String(pkg.payload.externalUrl);
      const githubRepo = String(pkg.payload.githubRepo);
      expect(externalUrl).toBe(`https://github.com/${githubRepo}`);
      expect(externalUrl).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
      expect(githubRepo).toMatch(/^[^/]+\/[^/]+$/);
    }
  });

  it("declara canal válido, área, licencia y assets en el payload", () => {
    for (const pkg of PAQUETES) {
      expect(["releases", "commits", "tags"]).toContain(
        String(pkg.payload.canal)
      );
      expect(Array.isArray(pkg.payload.area)).toBe(true);
      expect((pkg.payload.area as unknown[]).length).toBeGreaterThan(0);
      expect(typeof pkg.payload.licencia).toBe("string");
      expect("assets" in pkg.payload).toBe(true);
      expect(pkg.tags).toContain(String(pkg.payload.canal));
    }
  });

  it("ninguna ficha viene de reverse-skill (excluida por seguridad)", () => {
    for (const pkg of PAQUETES) {
      expect(pkg.id).not.toContain("reverse-skill");
      expect(String(pkg.payload.githubRepo)).not.toContain("reverse-skill");
      expect(JSON.stringify(pkg)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy es función de agente y conserva su skillId", () => {
    const anatomy = porId("lib-anatomy");
    expect(anatomy.kind).toBe("function");
    expect(anatomy.payload.skillId).toBe("anatomy");
    expect(anatomy.icon).toBe("Boxes");
  });

  it("lib-gods-eye alimenta mapas y avisa de la licencia NC de sus datos", () => {
    const godsEye = porId("lib-gods-eye");
    expect(godsEye.payload.area).toContain("mapas");
    expect(godsEye.description).toContain("CC-BY-NC");
    expect(String(godsEye.payload.licencia)).toContain("CC-BY-NC");
  });

  it("el icono sigue el kind de cada entrada", () => {
    const iconos: Record<string, string> = {
      app: "AppWindow",
      "ai-source": "BrainCircuit",
      function: "Boxes",
    };
    for (const pkg of PAQUETES) expect(pkg.icon).toBe(iconos[pkg.kind]);
  });

  it("honestidad radical: comingSoon, gratuita y autora = owner", () => {
    for (const pkg of PAQUETES) {
      expect(pkg.comingSoon).toBe(true);
      expect(pkg.free).toBe(true);
      expect(pkg.version).toBe("1.0.0");
      expect(pkg.author).toBe(String(pkg.payload.githubRepo).split("/")[0]);
      expect(pkg.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(pkg.description.length).toBeGreaterThan(0);
    }
  });

  it("el aviso de cada entrada viaja en la descripción, nunca oculto", () => {
    expect(porId("lib-wordcraft").description).toContain("Proyecto joven");
    expect(porId("lib-wordcraft").description).toContain(" — ");
    expect(porId("lib-detectron2").description).toContain("PESOS");
    expect(String(porId("lib-itsaplan").payload.licencia)).toContain("AGPL-3.0");
  });
});
