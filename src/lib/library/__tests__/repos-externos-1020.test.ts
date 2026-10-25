import { describe, it, expect } from "vitest";
import { REPO_EXTERNOS_1020, FICHAS_EXTERNAS_1020 } from "../repos-externos-1020";

const ids = FICHAS_EXTERNAS_1020.map((p) => p.id);

describe("repos-externos-1020 · tanda del 2026-10-20", () => {
  it("hay 14 ids y todas únicas", () => {
    expect(ids.length).toBe(14);
    expect(new Set(ids).size).toBe(14);
  });

  it("cada paquete declara externalUrl de GitHub y githubRepo owner/repo", () => {
    for (const p of FICHAS_EXTERNAS_1020) {
      expect(String(p.payload.externalUrl)).toMatch(/^https:\/\/github\.com\//);
      expect(String(p.payload.githubRepo)).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("ninguna id o repo es la excluida por seguridad (reverse-skill)", () => {
    for (const id of ids) expect(id).not.toContain("reverse-skill");
    for (const p of FICHAS_EXTERNAS_1020) {
      expect(String(p.payload.githubRepo)).not.toContain("reverse-skill");
    }
  });

  it("lib-anatomy lleva skillId anatomy (skill de agente)", () => {
    const ficha = FICHAS_EXTERNAS_1020.find((p) => p.id === "lib-anatomy");
    expect(ficha?.payload.skillId).toBe("anatomy");
  });

  it("lib-gods-eye pertenece al área mapas", () => {
    const ficha = FICHAS_EXTERNAS_1020.find((p) => p.id === "lib-gods-eye");
    expect(Array.isArray(ficha?.payload.area)).toBe(true);
    expect(ficha?.payload.area).toContain("mapas");
  });

  it("todas vienen honestas: comingSoon y repo builtin externo", () => {
    expect(REPO_EXTERNOS_1020.id).toBe("starseed-biblioteca-externa");
    expect(REPO_EXTERNOS_1020.builtin).toBe(true);
    for (const p of FICHAS_EXTERNAS_1020) {
      expect(p.free).toBe(true);
      expect(p.comingSoon).toBe(true);
      expect(p.sourceRepoId).toBe("starseed-biblioteca-externa");
    }
  });
});
