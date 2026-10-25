import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";
import { STARSEED_IA_TOOLS_REPO } from "../packages";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);

/* 14 paquetes de la 3.ª tanda menos lib-penpot: su repo (penpot/penpot) ya
 * enlaza el builtin iatool-penpot y no se duplica. */
const IDS_TANDA3 = [
  "lib-openworker",
  "lib-trail-code",
  "lib-img2threejs",
  "lib-openwhispr",
  "lib-paperclip",
  "lib-magnitude",
  "lib-artcraft",
  "lib-pocketbase",
  "lib-openmaic",
  "lib-chatwoot",
  "lib-excalidraw",
  "lib-nextcloud",
  "lib-supra-tex",
];

describe("repos-externos-1020c · 3.ª tanda merged con 1.ª y 2.ª", () => {
  it("hay 41 ids únicos en las tres tandas", () => {
    expect(ids.length).toBe(41);
    expect(new Set(ids).size).toBe(41);
  });

  it("las 13 paquetes restantes de la 3.ª tanda están", () => {
    for (const id of IDS_TANDA3) {
      const pkg = PAQUETES_EXTERNOS.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
    }
  });

  it("no aparece Kritt-ai/open-kritt (excluida 3.ª tanda)", () => {
    expect(githubRepos).not.toContain("Kritt-ai/open-kritt");
  });

  it("penpot/penpot no aparece dos veces: queda el builtin iatool-penpot", () => {
    // Deduplicado: el paquete externo con ese repo no se crea.
    expect(githubRepos.filter((r) => r === "penpot/penpot").length).toBe(0);
    expect(ids).not.toContain("lib-penpot");
    // El builtin sigue apuntando al mismo repo (1 vez en total en la Biblioteca).
    const builtin = STARSEED_IA_TOOLS_REPO.packages.find((p) => p.id === "iatool-penpot");
    expect(builtin?.payload.externalUrl).toBe("https://github.com/penpot/penpot");
    // Y REPOS_YA_PRESENTES lo hace visible.
    const presentes = REPOS_YA_PRESENTES.filter((e) => e.repo === "penpot/penpot");
    expect(presentes.length).toBe(1);
    expect(presentes[0]?.id).toBe("iatool-penpot");
  });

  it("REPOS_EXCLUIDOS incluye las tres exclusiones", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
  });
});
