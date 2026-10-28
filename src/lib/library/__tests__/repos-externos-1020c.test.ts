import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;
const reposCargados = new Set(paquetes.map((p) => String(p.payload.githubRepo)));

const IDS_TERCERA_TANDA = [
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

describe("REPO_EXTERNOS_1020 · 3.ª tanda (config/repos-libreria-1020c.json)", () => {
  it("los ids de las tres tandas son únicos", () => {
    const ids = paquetes.map((p) => p.id);
    expect(ids).toHaveLength(41);
    expect(new Set(ids).size).toBe(41);
  });

  it("no queda ningún repo excluido de la 3.ª tanda", () => {
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
    expect(reposCargados.has("Kritt-ai/open-kritt")).toBe(false);
    for (const p of PAQUETES_EXTERNOS) {
      expect(p.githubRepo).not.toBe("Kritt-ai/open-kritt");
    }
  });

  it("penpot/penpot no se duplica: sigue solo como iatool-penpot", () => {
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "penpot/penpot", id: "iatool-penpot" });
    expect(reposCargados.has("penpot/penpot")).toBe(false);
    expect(PAQUETES_EXTERNOS.filter((p) => p.githubRepo === "penpot/penpot")).toHaveLength(0);
  });

  it("penpot/penpot aparece una sola vez en el catálogo completo", () => {
    const penpot = allPackages().filter(
      (p) => p.payload.externalUrl === "https://github.com/penpot/penpot",
    );
    expect(penpot).toHaveLength(1);
    expect(penpot[0]?.id).toBe("iatool-penpot");
  });

  it("las 13 restantes de la 3.ª tanda están en el repo builtin", () => {
    expect(IDS_TERCERA_TANDA).toHaveLength(13);
    for (const id of IDS_TERCERA_TANDA) {
      const pkg = paquetes.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
      const url = pkg?.payload.externalUrl;
      expect(typeof url, id).toBe("string");
      expect(url as string, id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("las 13 restantes también están en la vista plana PAQUETES_EXTERNOS", () => {
    const ids = PAQUETES_EXTERNOS.map((p) => p.id);
    for (const id of IDS_TERCERA_TANDA) {
      expect(ids, `falta ${id}`).toContain(id);
    }
  });

  it("la 3.ª tanda aporta 13 fichas: sus 14 menos penpot, que ya estaba", () => {
    const idsTercera = new Set([...IDS_TERCERA_TANDA, "lib-penpot"]);
    const cargadas = paquetes.filter((p) => idsTercera.has(p.id));
    expect(cargadas).toHaveLength(13);
    expect(cargadas.some((p) => p.id === "lib-penpot")).toBe(false);
  });
});
