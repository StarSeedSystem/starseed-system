import { describe, it, expect } from "vitest";
import { PAQUETES_EXTERNOS, REPOS_EXCLUIDOS, REPOS_YA_PRESENTES } from "../repos-externos-1020";
import { allPackages } from "../packages";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const reposTanda3 = [
  "andrewyng/openworker",
  "trailhq/Trail-Code",
  "img2threejs/img2threejs",
  "OpenWhispr/openwhispr",
  "paperclipai/paperclip",
  "magnitudedev/magnitude",
  "storytold/artcraft",
  "pocketbase/pocketbase",
  "THU-MAIC/OpenMAIC",
  "chatwoot/chatwoot",
  "excalidraw/excalidraw",
  "nextcloud/all-in-one",
  "Supra-3D/SUPRA-Tex",
];

describe("repos-externos-1020 · 3.ª tanda integrada", () => {
  it("las tres tandas tienen ids únicos (28 + 13)", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(41);
  });

  it("no aparece ningún repo excluido (reverse-skill, Vikunja-Task, open-kritt)", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
    for (const excluido of REPOS_EXCLUIDOS) {
      expect(PAQUETES_EXTERNOS.find((p) => p.repo === excluido)).toBeUndefined();
    }
  });

  it("penpot/penpot no aparece dos veces: se descarta y queda en REPOS_YA_PRESENTES", () => {
    expect(PAQUETES_EXTERNOS.find((p) => p.repo === "penpot/penpot")).toBeUndefined();
    const entrada = REPOS_YA_PRESENTES.find((r) => r.repo === "penpot/penpot");
    expect(entrada?.id).toBe("iatool-penpot");
    expect(allPackages().filter((p) => p.payload?.externalUrl === "https://github.com/penpot/penpot")).toHaveLength(1);
  });

  it("las 13 repos restantes de la 3.ª tanda están presentes", () => {
    for (const repo of reposTanda3) {
      const p = PAQUETES_EXTERNOS.find((q) => q.repo === repo);
      expect(p, `falta ${repo}`).toBeDefined();
      expect(p?.externalUrl).toBe(`https://github.com/${repo}`);
    }
  });

  it("REPOS_YA_PRESENTES no menciona repos que sí se han portado", () => {
    for (const { repo } of REPOS_YA_PRESENTES) {
      expect(PAQUETES_EXTERNOS.find((p) => p.repo === repo)).toBeUndefined();
    }
  });
});
