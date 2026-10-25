import { describe, expect, it } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);
const externalUrls = PAQUETES_EXTERNOS.map((p) => p.externalUrl);
const fichas = REPO_EXTERNOS_1020.packages;
const fichasPorId = new Map(fichas.map((f) => [f.id, f]));

describe("repos-externos-1020 · cargador de las dos tandas", () => {
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

describe("REPO_EXTERNOS_1020 · repo builtin externo de la Biblioteca", () => {
  it("es el repo builtin starseed-biblioteca-externa con 14 fichas", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.name).toBe("Biblioteca externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
    expect(fichas.length).toBe(14);
  });

  it("las 14 ids son únicas", () => {
    const fichaIds = fichas.map((f) => f.id);
    expect(new Set(fichaIds).size).toBe(14);
  });

  it("cada ficha apunta a su repo de GitHub (externalUrl y githubRepo)", () => {
    for (const f of fichas) {
      const payload = f.payload as { externalUrl?: string; githubRepo?: string };
      expect(String(payload.externalUrl).startsWith("https://github.com/")).toBe(true);
      expect(String(payload.githubRepo)).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("NINGÚN id ni repo contiene 'reverse-skill' (excluida por seguridad)", () => {
    for (const f of fichas) {
      expect(f.id.includes("reverse-skill")).toBe(false);
      expect(String(f.payload.githubRepo).includes("reverse-skill")).toBe(false);
    }
    expect(ids.join(" ")).not.toContain("reverse-skill");
    expect(githubRepos.join(" ")).not.toContain("reverse-skill");
  });

  it("ninguna ficha dice gratuito falso ni promete instalación real (comingSoon)", () => {
    for (const f of fichas) {
      expect(f.free).toBe(true);
      expect(f.sourceRepoId).toBe("starseed-biblioteca-externa");
      expect(f.comingSoon).toBe(true);
    }
  });

  it("lib-anatomy lleva la skill de agente anatomy en su payload", () => {
    const anatomy = fichasPorId.get("lib-anatomy");
    expect(anatomy).toBeDefined();
    expect(anatomy?.kind).toBe("function");
    expect((anatomy?.payload as { skillId?: string }).skillId).toBe("anatomy");
  });

  it("lib-gods-eye pertenece al área 'mapas'", () => {
    const godsEye = fichasPorId.get("lib-gods-eye");
    expect(godsEye).toBeDefined();
    expect(Array.isArray((godsEye?.payload as { area?: string[] }).area)).toBe(true);
    expect((godsEye?.payload as { area?: string[] }).area).toContain("mapas");
  });

  it("cada ficha declara canal y licencia verificados del catálogo", () => {
    for (const f of fichas) {
      const payload = f.payload as { canal?: string; licencia?: string };
      expect(["releases", "tags", "commits"]).toContain(payload.canal);
      expect(String(payload.licencia).length).toBeGreaterThan(0);
    }
  });
});
