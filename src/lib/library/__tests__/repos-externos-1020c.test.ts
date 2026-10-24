import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
} from "../repos-externos-1020";

const ids = PAQUETES_EXTERNOS.map((p) => p.id);
const githubRepos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);

const TERCERA_TANDA_SIN_PENPOT = [
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

describe("repos-externos-1020c · 3.ª tanda merged con las dos anteriores", () => {
  it("tiene 41 ids únicos en las tres tandas", () => {
    expect(ids.length).toBe(41);
    expect(new Set(ids).size).toBe(41);
  });

  it("ningún repo excluido aparece en el catálogo", () => {
    for (const repo of REPOS_EXCLUIDOS) {
      expect(githubRepos).not.toContain(repo);
    }
  });

  it("excluye Kritt-ai/open-kritt de la 3.ª tanda", () => {
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
    expect(githubRepos).not.toContain("Kritt-ai/open-kritt");
  });

  it("penpot/penpot no se duplica y queda como ya presente", () => {
    expect(githubRepos.filter((r) => r === "penpot/penpot")).toHaveLength(0);
    expect(ids).not.toContain("lib-penpot");
    expect(REPOS_YA_PRESENTES).toContainEqual({
      repo: "penpot/penpot",
      id: "iatool-penpot",
    });
  });

  it("están las 13 restantes de la 3.ª tanda", () => {
    for (const repo of TERCERA_TANDA_SIN_PENPOT) {
      expect(githubRepos).toContain(repo);
    }
  });

  it("cada paquete de la 3.ª tanda conserva su mapeo honesto", () => {
    const openworker = PAQUETES_EXTERNOS.find((p) => p.id === "lib-openworker");
    expect(openworker?.repo).toBe("andrewyng/openworker");
    expect(openworker?.externalUrl).toBe("https://github.com/andrewyng/openworker");
    expect(openworker?.comingSoon).toBe(true);

    const excalidraw = PAQUETES_EXTERNOS.find((p) => p.id === "lib-excalidraw");
    expect(excalidraw?.efecto).toBe("FUNCIONAL");
    expect(excalidraw?.comingSoon).toBe(false);
  });
});
