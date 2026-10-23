import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);

/** 14 paquetes de la 3.ª tanda menos el duplicado (penpot ya está como builtin). */
const TANDA_3_RESTANTE: [string, string][] = [
  ["lib-openworker", "andrewyng/openworker"],
  ["lib-trail-code", "trailhq/Trail-Code"],
  ["lib-img2threejs", "img2threejs/img2threejs"],
  ["lib-openwhispr", "OpenWhispr/openwhispr"],
  ["lib-paperclip", "paperclipai/paperclip"],
  ["lib-magnitude", "magnitudedev/magnitude"],
  ["lib-artcraft", "storytold/artcraft"],
  ["lib-pocketbase", "pocketbase/pocketbase"],
  ["lib-openmaic", "THU-MAIC/OpenMAIC"],
  ["lib-chatwoot", "chatwoot/chatwoot"],
  ["lib-excalidraw", "excalidraw/excalidraw"],
  ["lib-nextcloud", "nextcloud/all-in-one"],
  ["lib-supra-tex", "Supra-3D/SUPRA-Tex"],
];

describe("repos-externos-1020 · 3.ª tanda integrada con las otras dos", () => {
  it("tienen 41 ids únicos entre las tres tandas", () => {
    expect(ids.length).toBe(41);
    expect(new Set(ids).size).toBe(41);
  });

  it("ningún repo excluido está en el catálogo y todas quedan anotadas", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
    const excluidos = new Set(REPOS_EXCLUIDOS);
    for (const repo of githubRepos) {
      expect(excluidos.has(repo)).toBe(false);
    }
  });

  it("penpot/penpot no aparece dos veces: sube como ya presente (iatool-penpot)", () => {
    expect(githubRepos).not.toContain("penpot/penpot");
    expect(ids).not.toContain("lib-penpot");
    expect(REPOS_YA_PRESENTES).toEqual([{ repo: "penpot/penpot", id: "iatool-penpot" }]);
    const veces = [...githubRepos, ...REPOS_YA_PRESENTES.map((y) => y.repo)].filter(
      (repo) => repo === "penpot/penpot",
    ).length;
    expect(veces).toBe(1);
  });

  it("las 13 restantes de la 3.ª tanda están con su id", () => {
    expect(TANDA_3_RESTANTE).toHaveLength(13);
    for (const [id, repo] of TANDA_3_RESTANTE) {
      const entrada = PAQUETES_EXTERNOS.find((p) => p.id === id);
      expect(entrada?.githubRepo).toBe(repo);
    }
  });
});
